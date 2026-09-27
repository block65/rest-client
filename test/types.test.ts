import { expectTypeOf, test } from "vitest";
import {
	CancelSubscriptionCommand,
	GetBillingAccountCommand,
	ImportBillingDataCommand,
	LinkBillingAccountCommand,
	UpdateBillingAccountCommand,
} from "./fixtures/test1/commands.ts";
import { BillingServiceRestApiRestClient } from "./fixtures/test1/main.ts";
import type {
	BillingAccount,
	LongRunningOperation,
} from "./fixtures/test1/types.ts";

const fakeApiUrl = new URL("https://192.0.2.1");

const client = new BillingServiceRestApiRestClient(fakeApiUrl, {
	fetcher: async () => ({
		url: fakeApiUrl,
		res: new Response(null, {
			status: 200,

			statusText: "OK",

			headers: new Headers({
				"x-is-fake": "yep",
			}),
		}),
	}),
});

test("command that will result in a void response", async () => {
	const result = await client.send(
		new CancelSubscriptionCommand({
			billingAccountId: "5678",
			subscriptionId: "1234",
		}),
	);
	expectTypeOf(result).toEqualTypeOf<undefined>();
});

test("command without a success response", () => {
	const result = client.send(
		new LinkBillingAccountCommand({
			accountId: "1234",
			billingAccountId: "5678",
		}),
	);
	expectTypeOf(result).toEqualTypeOf<Promise<never>>();
});

test("command without a body", async () => {
	const result = await client.send(
		new GetBillingAccountCommand({
			billingAccountId: "5678",
		}),
	);
	expectTypeOf(result).toEqualTypeOf<BillingAccount>();
});

test("command with a JSON body", async () => {
	const result = await client.send(
		new UpdateBillingAccountCommand({
			billingAccountId: "5678",
			country: "sg",
		}),
	);
	expectTypeOf(result).toEqualTypeOf<BillingAccount>();
});

test("command with a binary body and required headers", async () => {
	const result = await client.send(
		new ImportBillingDataCommand(
			{ billingAccountId: "5678", body: new Uint8Array() },
			{ "content-type": "text/csv", "content-length": "0" },
		),
	);
	expectTypeOf(result).toEqualTypeOf<LongRunningOperation>();
});
