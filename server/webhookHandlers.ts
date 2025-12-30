import { getStripeSync } from './stripeClient';
import { storage } from './storage';

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string, uuid: string): Promise<void> {
    if (!Buffer.isBuffer(payload)) {
      throw new Error(
        'STRIPE WEBHOOK ERROR: Payload must be a Buffer. ' +
        'Received type: ' + typeof payload + '. ' +
        'This usually means express.json() parsed the body before reaching this handler. ' +
        'FIX: Ensure webhook route is registered BEFORE app.use(express.json()).'
      );
    }

    const sync = await getStripeSync();
    await sync.processWebhook(payload, signature, uuid);
  }

  static async handlePaymentIntentSucceeded(paymentIntent: any): Promise<void> {
    const metadata = paymentIntent.metadata || {};
    const tipType = metadata.tipType;
    const tipTransactionId = metadata.tipTransactionId;

    if (tipTransactionId) {
      await storage.updateTipTransaction(tipTransactionId, {
        status: 'completed',
        stripePaymentIntentId: paymentIntent.id
      });

      console.log(`Tip ${tipTransactionId} marked as completed`);
    }
  }

  static async handlePaymentIntentFailed(paymentIntent: any): Promise<void> {
    const metadata = paymentIntent.metadata || {};
    const tipTransactionId = metadata.tipTransactionId;

    if (tipTransactionId) {
      await storage.updateTipTransaction(tipTransactionId, {
        status: 'failed',
        stripePaymentIntentId: paymentIntent.id
      });

      console.log(`Tip ${tipTransactionId} marked as failed`);
    }
  }

  static async handleCheckoutSessionCompleted(session: any): Promise<void> {
    const metadata = session.metadata || {};
    
    // Handle filmmaker Pro subscription
    if (metadata.type === 'filmmaker_pro_subscription' && metadata.filmmakerId) {
      const filmmakerId = metadata.filmmakerId;
      const subscriptionId = session.subscription;
      
      await storage.updateFilmmaker(filmmakerId, {
        subscriptionTier: 'pro',
        maxFilms: 999999,
        revenueSharePercent: 80,
        stripeSubscriptionId: subscriptionId,
        subscriptionStatus: 'active'
      });
      
      console.log(`[FilmmakerUpgrade] Filmmaker ${filmmakerId} upgraded to Pro (subscription: ${subscriptionId})`);
    }
  }

  static async handleSubscriptionUpdated(subscription: any): Promise<void> {
    const subscriptionId = subscription.id;
    const status = subscription.status;
    
    // Find filmmaker by subscription ID and update status
    const filmmaker = await storage.getFilmmakerByStripeSubscriptionId(subscriptionId);
    if (filmmaker) {
      const isActive = ['active', 'trialing'].includes(status);
      await storage.updateFilmmaker(filmmaker.id, {
        subscriptionStatus: status,
        subscriptionTier: isActive ? 'pro' : 'free',
        maxFilms: isActive ? 999999 : 2,
        revenueSharePercent: isActive ? 80 : 70
      });
      
      console.log(`[FilmmakerSubscription] Filmmaker ${filmmaker.id} subscription status: ${status}`);
    }
  }

  static async handleSubscriptionDeleted(subscription: any): Promise<void> {
    const subscriptionId = subscription.id;
    
    const filmmaker = await storage.getFilmmakerByStripeSubscriptionId(subscriptionId);
    if (filmmaker) {
      await storage.updateFilmmaker(filmmaker.id, {
        subscriptionStatus: 'canceled',
        subscriptionTier: 'free',
        maxFilms: 2,
        revenueSharePercent: 70,
        stripeSubscriptionId: null
      });
      
      console.log(`[FilmmakerSubscription] Filmmaker ${filmmaker.id} subscription canceled`);
    }
  }
}
