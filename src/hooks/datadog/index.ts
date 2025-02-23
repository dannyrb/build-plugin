// Unless explicitly stated otherwise all files in this repository are licensed under the MIT License.
// This product includes software developed at Datadog (https://www.datadoghq.com/).
// Copyright 2019-Present Datadog, Inc.

import c from 'chalk';

import { BuildPlugin } from '../../webpack';
import { getMetrics } from './aggregator';
import { getMetric, defaultFilters } from './helpers';
import { sendMetrics } from './sender';
import { OptionsInput, Options, DDHooksContext, MetricToSend } from './types';
import { formatDuration } from '../../helpers';

const getOptionsDD = (opts: OptionsInput = { apiKey: '' }): Options => ({
    timestamp: Math.floor((opts.timestamp || Date.now()) / 1000),
    apiKey: opts.apiKey,
    tags: opts.tags || [],
    endPoint: opts.endPoint || 'app.datadoghq.com',
    prefix: opts.prefix || '',
    filters: opts.filters || defaultFilters,
});

const preoutput = async function output(this: BuildPlugin, { report, stats }: DDHooksContext) {
    const optionsDD = getOptionsDD(this.options.datadog);

    let metrics: MetricToSend[] = [];
    try {
        metrics = getMetrics(report, stats, {
            ...optionsDD,
            context: this.options.context!,
        });
    } catch (e) {
        this.log(`Couldn't aggregate metrics. ${e.toString()}`, 'error');
    }

    return { metrics };
};

const postoutput = async function postoutput(
    this: BuildPlugin,
    { start, metrics }: DDHooksContext
) {
    const PLUGIN_NAME = this.constructor.name;
    const duration = Date.now() - start;
    const optionsDD = getOptionsDD(this.options.datadog);
    // We're missing the duration of this hook for our plugin.
    metrics.push(
        getMetric(
            {
                tags: [`pluginName:${PLUGIN_NAME}`],
                metric: `plugins.meta.duration`,
                type: 'duration',
                value: duration,
            },
            optionsDD
        )
    );

    this.log(`Took ${formatDuration(duration)}.`);

    // Send everything only if we have the key.
    if (!optionsDD.apiKey) {
        this.log(`Won't send metrics to ${c.bold('Datadog')}: missing API Key.`, 'warn');
        return;
    }
    try {
        const startSending = Date.now();
        await sendMetrics(metrics, {
            apiKey: optionsDD.apiKey,
            endPoint: optionsDD.endPoint,
        });
        this.log(`Sent metrics in ${formatDuration(Date.now() - startSending)}.`);
    } catch (e) {
        this.log(`Error sending metrics ${e.toString()}`, 'error');
    }

    return { metrics };
};

export const hooks = {
    preoutput,
    postoutput,
};
