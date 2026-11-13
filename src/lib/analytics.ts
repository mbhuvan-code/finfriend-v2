// Anonymous usage analytics for the Round 2 study, sent to PostHog.
//
// What is sent: named events (which screen, which button, which import method) with small,
// non-financial properties such as counts, step names, and yes/no flags.
// What is never sent: amounts, balances, merchant names, descriptions, dates someone typed,
// screenshots, or recordings. Session replay, autocapture, heatmaps, and surveys are off.
//
// Analytics only turns on when VITE_POSTHOG_KEY is set at build time. People can switch it off
// in Privacy and data.

import posthog from 'posthog-js'

const KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined
const HOST = (import.meta.env.VITE_POSTHOG_HOST as string | undefined) || 'https://us.i.posthog.com'

export const analyticsAvailable = Boolean(KEY)
let started = false

type Prop = string | number | boolean | null
export type Props = Record<string, Prop>

/** Every event name the app sends. Adding one here is the only way to send a new event. */
export type AnalyticsEvent =
  | 'onboarding_started'
  | 'onboarding_step_viewed'
  | 'onboarding_completed'
  | 'demo_started'
  | 'demo_exited'
  | 'import_started'
  | 'import_finished'
  | 'import_failed'
  | 'import_cancelled'
  | 'deposit_schedule_suggested'
  | 'deposit_schedule_applied'
  | 'transactions_confirmed'
  | 'dashboard_viewed'
  | 'tab_viewed'
  | 'period_selected'
  | 'hide_toggled'
  | 'calc_explainer_opened'
  | 'purchase_check_opened'
  | 'purchase_check_closed'
  | 'purchase_recorded'
  | 'transaction_added'
  | 'transaction_edited'
  | 'transaction_deleted'
  | 'balance_updated'
  | 'bill_marked_paid'
  | 'data_cleared'
  | 'analytics_opted_out'

// Last line of defense: drop any property value that looks like a dollar amount.
const MONEY = /\$\s?\d|\d+\.\d{2}\b/

function clean(props?: Props): Props {
  const out: Props = {}
  for (const [k, v] of Object.entries(props ?? {})) {
    if (typeof v === 'string' && MONEY.test(v)) continue
    out[k] = v
  }
  return out
}

export function startAnalytics(optedOut: boolean) {
  if (!KEY || started) return
  started = true
  posthog.init(KEY, {
    api_host: HOST,
    autocapture: false,
    capture_pageview: true,
    capture_pageleave: true,
    disable_session_recording: true,
    capture_heatmaps: false,
    capture_dead_clicks: false,
    rageclick: false,
    disable_surveys: true,
    disable_external_dependency_loading: true,
    mask_all_text: true,
    mask_all_element_attributes: true,
    advanced_disable_flags: true,
    person_profiles: 'identified_only',
    opt_out_capturing_by_default: optedOut,
    before_send: (event) => {
      if (event?.properties) {
        for (const [k, v] of Object.entries(event.properties)) {
          if (!k.startsWith('$') && typeof v === 'string' && MONEY.test(v)) delete event.properties[k]
        }
      }
      return event
    },
  })
  posthog.register({ app: 'finfriend-v2' })
}

export function track(event: AnalyticsEvent, props?: Props) {
  if (!started) return
  try {
    posthog.capture(event, clean(props))
  } catch {
    /* analytics must never break the app */
  }
}

/** Tags every later event so sample-data demos can be filtered out of study results. */
export function setDemoMode(demo: boolean) {
  if (!started) return
  posthog.register({ demo_mode: demo })
}

export function setOptOut(optedOut: boolean) {
  if (!started) return
  if (optedOut) {
    track('analytics_opted_out')
    posthog.opt_out_capturing()
  } else posthog.opt_in_capturing()
}
