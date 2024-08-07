/**
 * This file was auto generated by @block65/openapi-codegen
 *
 * WARN: Do not edit directly.
 *
 * Generated on 2024-07-20T05:47:35.352Z
 *
 */
import type {
  BillingAccount,
  BillingAccountList,
  BillingAccountPortal,
  BillingSubscriptionLro,
  BillingSubscriptions,
  CancelSubscriptionCommandInput,
  CreateBillingAccountCommandInput,
  CreateBillingSubscriptionCommandInput,
  CreatePaymentMethodCommandInput,
  DeletePaymentMethodCommandInput,
  GetBillingAccountCommandInput,
  GetBillingAccountPortalCommandInput,
  GetOperationCommandInput,
  GetPaymentMethodCommandInput,
  GetPaymentMethodFromStripeCommandInput,
  LinkBillingAccountCommandInput,
  ListBillingAccountsCommandInput,
  ListBillingSubscriptionsCommandInput,
  ListPaymentMethodsCommandInput,
  LongRunningOperation,
  PaymentMethod,
  PaymentMethodDeletedLro,
  PaymentMethodIntendedLro,
  PaymentMethods,
  UpdateBillingAccountCommandInput,
  UpdateBillingSubscriptionCommandInput,
  UpdateBillingSubscriptionPromoCodeCommandInput,
  UpdatePaymentMethodCommandInput,
} from './types.js';
import { RestServiceClient } from '@block65/rest-client';

type AllInputs =
  | CancelSubscriptionCommandInput
  | CreateBillingAccountCommandInput
  | CreateBillingSubscriptionCommandInput
  | CreatePaymentMethodCommandInput
  | DeletePaymentMethodCommandInput
  | GetBillingAccountCommandInput
  | GetBillingAccountPortalCommandInput
  | GetOperationCommandInput
  | GetPaymentMethodCommandInput
  | GetPaymentMethodFromStripeCommandInput
  | LinkBillingAccountCommandInput
  | ListBillingAccountsCommandInput
  | ListBillingSubscriptionsCommandInput
  | ListPaymentMethodsCommandInput
  | UpdateBillingAccountCommandInput
  | UpdateBillingSubscriptionCommandInput
  | UpdateBillingSubscriptionPromoCodeCommandInput
  | UpdatePaymentMethodCommandInput;
type AllOutputs =
  | BillingAccount
  | BillingAccountList
  | BillingAccountPortal
  | BillingSubscriptionLro
  | BillingSubscriptions
  | LongRunningOperation
  | PaymentMethod
  | PaymentMethodDeletedLro
  | PaymentMethodIntendedLro
  | PaymentMethods;

export class BillingServiceRestApiRestClient extends RestServiceClient<
  AllInputs,
  AllOutputs
> {}
