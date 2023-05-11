import { Command } from '../../../src/main.js';
import type { RequestMethodCaller } from '../../../src/main.js';
import type { Jsonifiable } from 'type-fest';
import type {
  GetOperationCommandInput,
  GetOperationCommandBody,
  LongRunningOperation,
  ListBillingAccountsCommandInput,
  ListBillingAccountsCommandBody,
  BillingAccountList,
  BillingAccountCreateRequest,
  CreateBillingAccountCommandInput,
  CreateBillingAccountCommandBody,
  BillingAccount,
  GetBillingAccountCommandInput,
  GetBillingAccountCommandBody,
  BillingAccountUpdateRequest,
  UpdateBillingAccountCommandInput,
  UpdateBillingAccountCommandBody,
  BillingAccountPortalRequest,
  GetBillingAccountPortalCommandInput,
  GetBillingAccountPortalCommandBody,
  BillingAccountPortal,
  LinkBillingAccountRequest,
  LinkBillingAccountCommandInput,
  LinkBillingAccountCommandBody,
  ListPaymentMethodsCommandInput,
  ListPaymentMethodsCommandBody,
  PaymentMethods,
  CreatePaymentMethodCommandInput,
  CreatePaymentMethodCommandBody,
  PaymentMethodIntendedLro,
  GetPaymentMethodFromStripeCommandInput,
  GetPaymentMethodFromStripeCommandBody,
  PaymentMethod,
  GetPaymentMethodCommandInput,
  GetPaymentMethodCommandBody,
  UpdatePaymentMethodRequest,
  UpdatePaymentMethodCommandInput,
  UpdatePaymentMethodCommandBody,
  DeletePaymentMethodCommandInput,
  DeletePaymentMethodCommandBody,
  PaymentMethodDeletedLro,
  ListBillingSubscriptionsCommandInput,
  ListBillingSubscriptionsCommandBody,
  BillingSubscriptions,
  CreateBillingSubscriptionRequest,
  CreateBillingSubscriptionCommandInput,
  CreateBillingSubscriptionCommandBody,
  BillingSubscriptionLro,
  UpdateBillingSubscriptionRequest,
  UpdateBillingSubscriptionCommandInput,
  UpdateBillingSubscriptionCommandBody,
  CancelSubscriptionCommandInput,
  CancelSubscriptionCommandBody,
  UpdateBillingSubscriptionPromoCodeRequest,
  UpdateBillingSubscriptionPromoCodeCommandInput,
  UpdateBillingSubscriptionPromoCodeCommandBody,
} from './types.js';

/**
 * getOperationCommand
 * @param operationId {String}
 * @returns {RequestMethodCaller<LongRunningOperation>} HTTP 200
 */
export function getOperationCommand(
  operationId: string,
): RequestMethodCaller<LongRunningOperation> {
  const req = {
    method: 'get' as const,
    pathname: `/operations/${operationId}`,
  };
  return (requestMethod, options) => requestMethod(req, options);
}

/**
 * getOperationCommand
 *
 *
 */
export class GetOperationCommand extends Command<
  GetOperationCommandInput,
  LongRunningOperation,
  GetOperationCommandBody
> {
  public override method = 'get' as const;

  constructor(input: GetOperationCommandInput) {
    const { operationId } = input;
    super(`/operations/${operationId}`);
  }
}

/**
 * listBillingAccountsCommand
 * @returns {RequestMethodCaller<BillingAccountList>} HTTP 200
 */
export function listBillingAccountsCommand(): RequestMethodCaller<BillingAccountList> {
  const req = {
    method: 'get' as const,
    pathname: `/billing-accounts`,
  };
  return (requestMethod, options) => requestMethod(req, options);
}

/**
 * listBillingAccountsCommand
 *
 *
 */
export class ListBillingAccountsCommand extends Command<
  void,
  BillingAccountList,
  ListBillingAccountsCommandBody
> {
  public override method = 'get' as const;

  constructor() {
    // no input parameters
    super(`/billing-accounts`);
  }
}

/**
 * createBillingAccountCommand
 * @param parameters.body {BillingAccountCreateRequest}
 * @returns {RequestMethodCaller<BillingAccount>} HTTP 200
 */
export function createBillingAccountCommand(parameters: {
  body: BillingAccountCreateRequest;
}): RequestMethodCaller<BillingAccount> {
  const req = {
    method: 'post' as const,
    pathname: `/billing-accounts`,
    body: parameters.body,
  };
  return (requestMethod, options) => requestMethod(req, options);
}

/**
 * createBillingAccountCommand
 *
 *
 */
export class CreateBillingAccountCommand extends Command<
  CreateBillingAccountCommandInput,
  BillingAccount,
  CreateBillingAccountCommandBody
> {
  public override method = 'post' as const;

  constructor(input: CreateBillingAccountCommandInput) {
    const body = input;
    super(`/billing-accounts`, body);
  }
}

/**
 * getBillingAccountCommand
 * @param billingAccountId {String}
 * @returns {RequestMethodCaller<BillingAccount>} HTTP 200
 */
export function getBillingAccountCommand(
  billingAccountId: string,
): RequestMethodCaller<BillingAccount> {
  const req = {
    method: 'get' as const,
    pathname: `/billing-accounts/${billingAccountId}`,
  };
  return (requestMethod, options) => requestMethod(req, options);
}

/**
 * getBillingAccountCommand
 *
 *
 */
export class GetBillingAccountCommand extends Command<
  GetBillingAccountCommandInput,
  BillingAccount,
  GetBillingAccountCommandBody
> {
  public override method = 'get' as const;

  constructor(input: GetBillingAccountCommandInput) {
    const { billingAccountId } = input;
    super(`/billing-accounts/${billingAccountId}`);
  }
}

/**
 * updateBillingAccountCommand
 * @param billingAccountId {String}
 * @param parameters.body {BillingAccountUpdateRequest}
 * @returns {RequestMethodCaller<BillingAccount>} HTTP 200
 */
export function updateBillingAccountCommand(
  billingAccountId: string,
  parameters: {
    body: BillingAccountUpdateRequest;
  },
): RequestMethodCaller<BillingAccount> {
  const req = {
    method: 'put' as const,
    pathname: `/billing-accounts/${billingAccountId}`,
    body: parameters.body,
  };
  return (requestMethod, options) => requestMethod(req, options);
}

/**
 * updateBillingAccountCommand
 *
 *
 */
export class UpdateBillingAccountCommand extends Command<
  UpdateBillingAccountCommandInput,
  BillingAccount,
  UpdateBillingAccountCommandBody
> {
  public override method = 'put' as const;

  constructor(input: UpdateBillingAccountCommandInput) {
    const { billingAccountId, ...body } = input;
    super(`/billing-accounts/${billingAccountId}`, body);
  }
}

/**
 * getBillingAccountPortalCommand
 * @param billingAccountId {String}
 * @param parameters.body {BillingAccountPortalRequest}
 * @returns {RequestMethodCaller<BillingAccountPortal>} HTTP 200
 */
export function getBillingAccountPortalCommand(
  billingAccountId: string,
  parameters: {
    body: BillingAccountPortalRequest;
  },
): RequestMethodCaller<BillingAccountPortal> {
  const req = {
    method: 'post' as const,
    pathname: `/billing-accounts/${billingAccountId}/portal`,
    body: parameters.body,
  };
  return (requestMethod, options) => requestMethod(req, options);
}

/**
 * getBillingAccountPortalCommand
 *
 *
 */
export class GetBillingAccountPortalCommand extends Command<
  GetBillingAccountPortalCommandInput,
  BillingAccountPortal,
  GetBillingAccountPortalCommandBody
> {
  public override method = 'post' as const;

  constructor(input: GetBillingAccountPortalCommandInput) {
    const { billingAccountId, ...body } = input;
    super(`/billing-accounts/${billingAccountId}/portal`, body);
  }
}

/**
 * linkBillingAccountCommand
 * @param billingAccountId {String}
 * @param parameters.body {LinkBillingAccountRequest}
 */
export function linkBillingAccountCommand(
  billingAccountId: string,
  parameters: {
    body: LinkBillingAccountRequest;
  },
): RequestMethodCaller<void> {
  const req = {
    method: 'post' as const,
    pathname: `/billing-accounts/${billingAccountId}/link`,
    body: parameters.body,
  };
  return (requestMethod, options) => requestMethod(req, options);
}

/**
 * linkBillingAccountCommand
 *
 *
 */
export class LinkBillingAccountCommand extends Command<
  LinkBillingAccountCommandInput,
  void,
  LinkBillingAccountCommandBody
> {
  public override method = 'post' as const;

  constructor(input: LinkBillingAccountCommandInput) {
    const { billingAccountId, ...body } = input;
    super(`/billing-accounts/${billingAccountId}/link`, body);
  }
}

/**
 * listPaymentMethodsCommand
 * @param billingAccountId {String}
 * @returns {RequestMethodCaller<PaymentMethods>} HTTP 200
 */
export function listPaymentMethodsCommand(
  billingAccountId: string,
): RequestMethodCaller<PaymentMethods> {
  const req = {
    method: 'get' as const,
    pathname: `/billing-accounts/${billingAccountId}/payment-methods`,
  };
  return (requestMethod, options) => requestMethod(req, options);
}

/**
 * listPaymentMethodsCommand
 *
 *
 */
export class ListPaymentMethodsCommand extends Command<
  ListPaymentMethodsCommandInput,
  PaymentMethods,
  ListPaymentMethodsCommandBody
> {
  public override method = 'get' as const;

  constructor(input: ListPaymentMethodsCommandInput) {
    const { billingAccountId } = input;
    super(`/billing-accounts/${billingAccountId}/payment-methods`);
  }
}

/**
 * createPaymentMethodCommand
 * @param billingAccountId {String}
 * @returns {RequestMethodCaller<PaymentMethodIntendedLro>} HTTP 200
 */
export function createPaymentMethodCommand(
  billingAccountId: string,
): RequestMethodCaller<PaymentMethodIntendedLro> {
  const req = {
    method: 'post' as const,
    pathname: `/billing-accounts/${billingAccountId}/payment-methods`,
  };
  return (requestMethod, options) => requestMethod(req, options);
}

/**
 * createPaymentMethodCommand
 *
 *
 */
export class CreatePaymentMethodCommand extends Command<
  CreatePaymentMethodCommandInput,
  PaymentMethodIntendedLro,
  CreatePaymentMethodCommandBody
> {
  public override method = 'post' as const;

  constructor(input: CreatePaymentMethodCommandInput) {
    const { billingAccountId } = input;
    super(`/billing-accounts/${billingAccountId}/payment-methods`);
  }
}

/**
 * getPaymentMethodFromStripeCommand
 * @param billingAccountId {String}
 * @param stripePaymentMethodId {String}
 * @returns {RequestMethodCaller<PaymentMethod>} HTTP 200
 */
export function getPaymentMethodFromStripeCommand(
  billingAccountId: string,
  stripePaymentMethodId: string,
): RequestMethodCaller<PaymentMethod> {
  const req = {
    method: 'get' as const,
    pathname: `/billing-accounts/${billingAccountId}/payment-methods/stripe/${stripePaymentMethodId}`,
  };
  return (requestMethod, options) => requestMethod(req, options);
}

/**
 * getPaymentMethodFromStripeCommand
 *
 *
 */
export class GetPaymentMethodFromStripeCommand extends Command<
  GetPaymentMethodFromStripeCommandInput,
  PaymentMethod,
  GetPaymentMethodFromStripeCommandBody
> {
  public override method = 'get' as const;

  constructor(input: GetPaymentMethodFromStripeCommandInput) {
    const { billingAccountId, stripePaymentMethodId } = input;
    super(
      `/billing-accounts/${billingAccountId}/payment-methods/stripe/${stripePaymentMethodId}`,
    );
  }
}

/**
 * getPaymentMethodCommand
 * @param billingAccountId {String}
 * @param paymentMethodId {String}
 * @returns {RequestMethodCaller<PaymentMethod>} HTTP 200
 */
export function getPaymentMethodCommand(
  billingAccountId: string,
  paymentMethodId: string,
): RequestMethodCaller<PaymentMethod> {
  const req = {
    method: 'get' as const,
    pathname: `/billing-accounts/${billingAccountId}/payment-methods/${paymentMethodId}`,
  };
  return (requestMethod, options) => requestMethod(req, options);
}

/**
 * getPaymentMethodCommand
 *
 *
 */
export class GetPaymentMethodCommand extends Command<
  GetPaymentMethodCommandInput,
  PaymentMethod,
  GetPaymentMethodCommandBody
> {
  public override method = 'get' as const;

  constructor(input: GetPaymentMethodCommandInput) {
    const { billingAccountId, paymentMethodId } = input;
    super(
      `/billing-accounts/${billingAccountId}/payment-methods/${paymentMethodId}`,
    );
  }
}

/**
 * updatePaymentMethodCommand
 * @param billingAccountId {String}
 * @param paymentMethodId {String}
 * @param parameters.body {UpdatePaymentMethodRequest}
 */
export function updatePaymentMethodCommand(
  billingAccountId: string,
  paymentMethodId: string,
  parameters: {
    body: UpdatePaymentMethodRequest;
  },
): RequestMethodCaller<void> {
  const req = {
    method: 'put' as const,
    pathname: `/billing-accounts/${billingAccountId}/payment-methods/${paymentMethodId}`,
    body: parameters.body,
  };
  return (requestMethod, options) => requestMethod(req, options);
}

/**
 * updatePaymentMethodCommand
 *
 *
 */
export class UpdatePaymentMethodCommand extends Command<
  UpdatePaymentMethodCommandInput,
  void,
  UpdatePaymentMethodCommandBody
> {
  public override method = 'put' as const;

  constructor(input: UpdatePaymentMethodCommandInput) {
    const { billingAccountId, paymentMethodId, ...body } = input;
    super(
      `/billing-accounts/${billingAccountId}/payment-methods/${paymentMethodId}`,
      body,
    );
  }
}

/**
 * deletePaymentMethodCommand
 * @param billingAccountId {String}
 * @param paymentMethodId {String}
 * @returns {RequestMethodCaller<PaymentMethodDeletedLro>} HTTP 200
 */
export function deletePaymentMethodCommand(
  billingAccountId: string,
  paymentMethodId: string,
): RequestMethodCaller<PaymentMethodDeletedLro> {
  const req = {
    method: 'delete' as const,
    pathname: `/billing-accounts/${billingAccountId}/payment-methods/${paymentMethodId}`,
  };
  return (requestMethod, options) => requestMethod(req, options);
}

/**
 * deletePaymentMethodCommand
 *
 *
 */
export class DeletePaymentMethodCommand extends Command<
  DeletePaymentMethodCommandInput,
  PaymentMethodDeletedLro,
  DeletePaymentMethodCommandBody
> {
  public override method = 'delete' as const;

  constructor(input: DeletePaymentMethodCommandInput) {
    const { billingAccountId, paymentMethodId } = input;
    super(
      `/billing-accounts/${billingAccountId}/payment-methods/${paymentMethodId}`,
    );
  }
}

/**
 * listBillingSubscriptionsCommand
 * @param billingAccountId {String}
 * @returns {RequestMethodCaller<BillingSubscriptions>} HTTP 200
 */
export function listBillingSubscriptionsCommand(
  billingAccountId: string,
): RequestMethodCaller<BillingSubscriptions> {
  const req = {
    method: 'get' as const,
    pathname: `/billing-accounts/${billingAccountId}/subscriptions`,
  };
  return (requestMethod, options) => requestMethod(req, options);
}

/**
 * listBillingSubscriptionsCommand
 *
 *
 */
export class ListBillingSubscriptionsCommand extends Command<
  ListBillingSubscriptionsCommandInput,
  BillingSubscriptions,
  ListBillingSubscriptionsCommandBody
> {
  public override method = 'get' as const;

  constructor(input: ListBillingSubscriptionsCommandInput) {
    const { billingAccountId } = input;
    super(`/billing-accounts/${billingAccountId}/subscriptions`);
  }
}

/**
 * createBillingSubscriptionCommand
 * @param billingAccountId {String}
 * @param parameters.body {CreateBillingSubscriptionRequest}
 * @returns {RequestMethodCaller<BillingSubscriptionLro>} HTTP 200
 */
export function createBillingSubscriptionCommand(
  billingAccountId: string,
  parameters: {
    body: CreateBillingSubscriptionRequest;
  },
): RequestMethodCaller<BillingSubscriptionLro> {
  const req = {
    method: 'post' as const,
    pathname: `/billing-accounts/${billingAccountId}/subscriptions`,
    body: parameters.body,
  };
  return (requestMethod, options) => requestMethod(req, options);
}

/**
 * createBillingSubscriptionCommand
 *
 *
 */
export class CreateBillingSubscriptionCommand extends Command<
  CreateBillingSubscriptionCommandInput,
  BillingSubscriptionLro,
  CreateBillingSubscriptionCommandBody
> {
  public override method = 'post' as const;

  constructor(input: CreateBillingSubscriptionCommandInput) {
    const { billingAccountId, ...body } = input;
    super(`/billing-accounts/${billingAccountId}/subscriptions`, body);
  }
}

/**
 * updateBillingSubscriptionCommand
 * @param billingAccountId {String}
 * @param subscriptionId {String}
 * @param parameters.body {UpdateBillingSubscriptionRequest}
 */
export function updateBillingSubscriptionCommand(
  billingAccountId: string,
  subscriptionId: string,
  parameters: {
    body: UpdateBillingSubscriptionRequest;
  },
): RequestMethodCaller<void> {
  const req = {
    method: 'put' as const,
    pathname: `/billing-accounts/${billingAccountId}/subscriptions/${subscriptionId}`,
    body: parameters.body,
  };
  return (requestMethod, options) => requestMethod(req, options);
}

/**
 * updateBillingSubscriptionCommand
 *
 *
 */
export class UpdateBillingSubscriptionCommand extends Command<
  UpdateBillingSubscriptionCommandInput,
  void,
  UpdateBillingSubscriptionCommandBody
> {
  public override method = 'put' as const;

  constructor(input: UpdateBillingSubscriptionCommandInput) {
    const { billingAccountId, subscriptionId, ...body } = input;
    super(
      `/billing-accounts/${billingAccountId}/subscriptions/${subscriptionId}`,
      body,
    );
  }
}

/**
 * cancelSubscriptionCommand
 * @param billingAccountId {String}
 * @param subscriptionId {String}
 */
export function cancelSubscriptionCommand(
  billingAccountId: string,
  subscriptionId: string,
): RequestMethodCaller<void> {
  const req = {
    method: 'delete' as const,
    pathname: `/billing-accounts/${billingAccountId}/subscriptions/${subscriptionId}`,
  };
  return (requestMethod, options) => requestMethod(req, options);
}

/**
 * cancelSubscriptionCommand
 *
 *
 */
export class CancelSubscriptionCommand extends Command<
  CancelSubscriptionCommandInput,
  void,
  CancelSubscriptionCommandBody
> {
  public override method = 'delete' as const;

  constructor(input: CancelSubscriptionCommandInput) {
    const { billingAccountId, subscriptionId } = input;
    super(
      `/billing-accounts/${billingAccountId}/subscriptions/${subscriptionId}`,
    );
  }
}

/**
 * updateBillingSubscriptionPromoCodeCommand
 * @param billingAccountId {String}
 * @param subscriptionId {String}
 * @param parameters.body {UpdateBillingSubscriptionPromoCodeRequest}
 * @returns {RequestMethodCaller<BillingSubscriptionLro>} HTTP 200
 */
export function updateBillingSubscriptionPromoCodeCommand(
  billingAccountId: string,
  subscriptionId: string,
  parameters: {
    body: UpdateBillingSubscriptionPromoCodeRequest;
  },
): RequestMethodCaller<BillingSubscriptionLro> {
  const req = {
    method: 'put' as const,
    pathname: `/billing-accounts/${billingAccountId}/subscriptions/${subscriptionId}/promo-code`,
    body: parameters.body,
  };
  return (requestMethod, options) => requestMethod(req, options);
}

/**
 * updateBillingSubscriptionPromoCodeCommand
 *
 *
 */
export class UpdateBillingSubscriptionPromoCodeCommand extends Command<
  UpdateBillingSubscriptionPromoCodeCommandInput,
  BillingSubscriptionLro,
  UpdateBillingSubscriptionPromoCodeCommandBody
> {
  public override method = 'put' as const;

  constructor(input: UpdateBillingSubscriptionPromoCodeCommandInput) {
    const { billingAccountId, subscriptionId, ...body } = input;
    super(
      `/billing-accounts/${billingAccountId}/subscriptions/${subscriptionId}/promo-code`,
      body,
    );
  }
}
