/**
 * stripe-billing.js — Stripe integration for hosted mode
 *
 * Handles checkout sessions, customer portal, and webhook verification.
 *
 * IMPORTANT: This file is source-available under the YokeBot Enterprise
 * License (see ee/LICENSE). No secrets, API keys, billing data, or
 * private business information should ever appear in this file.
 */

import Stripe from 'stripe'

let _stripe = null

function getStripe() {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY
    if (!key) throw new Error('STRIPE_SECRET_KEY not configured')
    _stripe = new Stripe(key)
  }
  return _stripe
}

/**
 * Create a Stripe Checkout session for a subscription.
 */
export async function createSubscriptionCheckout(teamId, userId, email, priceId, successUrl, cancelUrl) {
  const stripe = getStripe()

  const customers = await stripe.customers.list({ email, limit: 1 })
  let customer = customers.data[0]
  if (!customer) {
    customer = await stripe.customers.create({
      email,
      metadata: { yokebot_team_id: teamId, yokebot_user_id: userId },
    })
  }

  const session = await stripe.checkout.sessions.create({
    customer: customer.id,
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    subscription_data: { metadata: { yokebot_team_id: teamId } },
    metadata: { yokebot_team_id: teamId },
  })

  return { sessionId: session.id, url: session.url, customerId: customer.id }
}

/**
 * Create a Stripe Checkout session for a one-time credit pack purchase.
 */
export async function createCreditPackCheckout(teamId, userId, email, priceId, successUrl, cancelUrl) {
  const stripe = getStripe()

  const customers = await stripe.customers.list({ email, limit: 1 })
  let customer = customers.data[0]
  if (!customer) {
    customer = await stripe.customers.create({
      email,
      metadata: { yokebot_team_id: teamId, yokebot_user_id: userId },
    })
  }

  const session = await stripe.checkout.sessions.create({
    customer: customer.id,
    mode: 'payment',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    payment_intent_data: { metadata: { yokebot_team_id: teamId } },
    metadata: { yokebot_team_id: teamId, type: 'credit_pack' },
  })

  return { sessionId: session.id, url: session.url, customerId: customer.id }
}

/**
 * Create a Stripe Customer Portal session.
 */
export async function createPortalSession(stripeCustomerId, returnUrl) {
  const stripe = getStripe()
  const session = await stripe.billingPortal.sessions.create({
    customer: stripeCustomerId,
    return_url: returnUrl,
  })
  return { url: session.url }
}

/**
 * Verify and construct a Stripe webhook event.
 */
export function constructWebhookEvent(payload, signature) {
  const stripe = getStripe()
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!webhookSecret) throw new Error('STRIPE_WEBHOOK_SECRET not configured')
  return stripe.webhooks.constructEvent(payload, signature, webhookSecret)
}

/**
 * Retrieve a subscription from Stripe with expanded price/product data.
 */
export async function getStripeSubscription(subscriptionId) {
  const stripe = getStripe()
  return stripe.subscriptions.retrieve(subscriptionId, {
    expand: ['items.data.price.product'],
  })
}

/**
 * List line items for a checkout session (used for credit pack detection).
 */
export async function listCheckoutLineItems(sessionId) {
  const stripe = getStripe()
  return stripe.checkout.sessions.listLineItems(sessionId, { limit: 1 })
}
