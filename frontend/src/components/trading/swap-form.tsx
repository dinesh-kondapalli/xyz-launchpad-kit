"use client";

import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
} from "@/components/ui/form";
import { Slider } from "@/components/ui/slider";
import { useWalletStore } from "@/stores/wallet-store";
import {
  simulateSwap,
  swapXyzForToken,
  swapTokenForXyz,
} from "@/lib/contract-clients/amm";
import { createContractClient } from "@xyz-chain/sdk";
import { RPC_ENDPOINT, REST_ENDPOINT, CHAIN_ID } from "@/lib/chain-config";
import { toUxyz, computeMinOutput } from "@/lib/utils";
import { swapFormSchema, type SwapFormValues } from "@/lib/validation/trading-schemas";
import { AmountInput } from "./amount-input";
import { TradePreview } from "./trade-preview";
import { TOKENS_QUERY_KEY } from "@/hooks/use-tokens";
import { TOKEN_DETAIL_QUERY_KEY } from "@/hooks/use-token-detail";

interface SwapFormProps {
  tokenAddress: string;
  tokenSymbol: string;
}

export function SwapForm({ tokenAddress, tokenSymbol }: SwapFormProps) {
  const queryClient = useQueryClient();
  const { connection, address, client, refreshBalance } = useWalletStore();

  // Direction: true = XYZ -> Token (buy), false = Token -> XYZ (sell)
  const [buyDirection, setBuyDirection] = useState(true);

  const form = useForm<SwapFormValues>({
    resolver: zodResolver(swapFormSchema),
    defaultValues: { offerAmount: "", slippage: 1 },
  });

  const offerAmount = useWatch({ control: form.control, name: "offerAmount" });
  const slippage = useWatch({ control: form.control, name: "slippage" });

  // Simulation query
  const { data: simulation, isLoading: isSimulating } = useQuery({
    queryKey: [
      "simulate-swap",
      tokenAddress,
      buyDirection ? "xyz_to_token" : "token_to_xyz",
      offerAmount,
    ],
    queryFn: () => {
      const amountMicro = toUxyz(offerAmount);
      return simulateSwap(client!, tokenAddress, buyDirection, amountMicro);
    },
    enabled:
      !!client &&
      !!offerAmount &&
      !isNaN(Number(offerAmount)) &&
      Number(offerAmount) >= 0.001,
    staleTime: 5_000,
  });

  const mutation = useMutation({
    mutationFn: async (values: SwapFormValues) => {
      if (!connection || !address) throw new Error("Wallet not connected");
      if (!simulation) throw new Error("Price simulation not ready");

      const contractClient = await createContractClient(
        { rpcEndpoint: RPC_ENDPOINT, restEndpoint: REST_ENDPOINT, chainId: CHAIN_ID },
        connection
      );

      const amountMicro = toUxyz(values.offerAmount);
      const minOutput = computeMinOutput(
        simulation.output_amount,
        values.slippage
      );

      if (buyDirection) {
        // XYZ -> Token: send native XYZ funds
        return swapXyzForToken(
          contractClient,
          address,
          tokenAddress,
          amountMicro,
          minOutput
        );
      } else {
        // Token -> XYZ: use CW20 Send pattern
        return swapTokenForXyz(
          contractClient,
          address,
          tokenAddress,
          amountMicro,
          minOutput
        );
      }
    },
    onMutate: () => {
      toast.loading("Confirming swap...", { id: "swap-tx" });
    },
    onSuccess: (result) => {
      toast.success("Swap complete!", {
        id: "swap-tx",
        description: `Tx: ${result.transactionHash.slice(0, 12)}...`,
      });
      form.reset();
      refreshBalance();
      queryClient.invalidateQueries({ queryKey: TOKENS_QUERY_KEY });
      queryClient.invalidateQueries({
        queryKey: TOKEN_DETAIL_QUERY_KEY(tokenAddress),
      });
    },
    onError: (error) => {
      const message =
        error instanceof Error ? error.message : "Unknown error";
      toast.error("Swap failed", {
        id: "swap-tx",
        description: message.includes("insufficient")
          ? "Insufficient balance"
          : message.includes("min output")
          ? "Price moved -- try increasing slippage"
          : message,
      });
    },
  });

  const canSubmit =
    !!connection && !!simulation && !isSimulating && !mutation.isPending;

  const inputDenom = buyDirection ? "XYZ" : tokenSymbol;
  const outputDenom = buyDirection ? tokenSymbol : "XYZ";
  const outputIsXyz = !buyDirection;

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
        className="space-y-6"
      >
        {/* Direction toggle */}
        <div className="inline-flex h-10 w-full items-stretch rounded-xl border border-zinc-800 bg-zinc-950 p-1">
          <button
            type="button"
              className={`flex-1 rounded-md text-sm font-semibold transition-colors touch-manipulation ${
                buyDirection
                  ? "bg-pink-900/35 text-pink-100"
                  : "text-zinc-500 hover:text-zinc-100"
              }`}
            onClick={() => {
              setBuyDirection(true);
              form.reset();
            }}
          >
            Buy {tokenSymbol}
          </button>
          <button
            type="button"
              className={`flex-1 rounded-md text-sm font-semibold transition-colors touch-manipulation ${
                !buyDirection
                  ? "bg-pink-900/35 text-pink-100"
                  : "text-zinc-500 hover:text-zinc-100"
              }`}
            onClick={() => {
              setBuyDirection(false);
              form.reset();
            }}
          >
            Sell {tokenSymbol}
          </button>
        </div>

        <FormField
          control={form.control}
          name="offerAmount"
          render={({ field, fieldState }) => (
            <FormItem>
              <AmountInput
                value={field.value}
                onChange={field.onChange}
                label={`You pay (${inputDenom})`}
                denom={inputDenom}
                presets={
                  buyDirection
                    ? [0.1, 0.5, 1, 5]
                    : [10, 100, 1000, 10000]
                }
                error={fieldState.error?.message}
                disabled={mutation.isPending}
              />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="slippage"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Slippage Tolerance: {field.value}%</FormLabel>
              <FormControl>
                <Slider
                  min={0.5}
                  max={5}
                  step={0.1}
                  value={[field.value]}
                  onValueChange={(vals) => field.onChange(vals[0])}
                  disabled={mutation.isPending}
                />
              </FormControl>
            </FormItem>
          )}
        />

        {simulation && (
          <TradePreview
            estimatedOutput={simulation.output_amount}
            minOutput={computeMinOutput(
              simulation.output_amount,
              slippage
            )}
            feeAmount={simulation.fee_amount}
            slippagePercent={slippage}
            outputDenom={outputDenom}
            outputIsXyz={outputIsXyz}
            priceImpact={simulation.price_impact}
          />
        )}

        <Button
          type="submit"
          className="w-full min-h-[44px] touch-manipulation active:scale-[0.98]"
          disabled={!canSubmit}
        >
          {!connection
            ? "Connect Wallet"
            : mutation.isPending
            ? "Confirming..."
            : isSimulating
            ? "Fetching price..."
            : `Swap ${inputDenom} for ${outputDenom}`}
        </Button>
      </form>
    </Form>
  );
}
