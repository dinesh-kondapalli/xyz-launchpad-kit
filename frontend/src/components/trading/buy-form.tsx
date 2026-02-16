"use client";

import { useForm } from "react-hook-form";
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
  FormMessage,
} from "@/components/ui/form";
import { Slider } from "@/components/ui/slider";
import { useWalletStore } from "@/stores/wallet-store";
import { simulateBuy, buyTokens } from "@/lib/contract-clients/launchpad";
import { createContractClient } from "@xyz-chain/sdk";
import { RPC_ENDPOINT, REST_ENDPOINT, CHAIN_ID } from "@/lib/chain-config";
import { toUxyz, computeMinOutput } from "@/lib/utils";
import { buyFormSchema, type BuyFormValues } from "@/lib/validation/trading-schemas";
import { AmountInput } from "./amount-input";
import { TradePreview } from "./trade-preview";
import { TOKENS_QUERY_KEY } from "@/hooks/use-tokens";
import { TOKEN_DETAIL_QUERY_KEY } from "@/hooks/use-token-detail";

interface BuyFormProps {
  tokenAddress: string;
  tokenSymbol: string;
}

export function BuyForm({ tokenAddress, tokenSymbol }: BuyFormProps) {
  const queryClient = useQueryClient();
  const { connection, address, client, refreshBalance } = useWalletStore();

  const form = useForm<BuyFormValues>({
    resolver: zodResolver(buyFormSchema),
    defaultValues: { xyzAmount: "", slippage: 1 },
  });

  const xyzAmount = form.watch("xyzAmount");
  const slippage = form.watch("slippage");

  // Real-time simulation query
  const { data: simulation, isLoading: isSimulating } = useQuery({
    queryKey: ["simulate-buy", tokenAddress, xyzAmount],
    queryFn: () => {
      const amountUxyz = toUxyz(xyzAmount);
      return simulateBuy(client!, tokenAddress, amountUxyz);
    },
    enabled:
      !!client &&
      !!xyzAmount &&
      !isNaN(Number(xyzAmount)) &&
      Number(xyzAmount) >= 0.001,
    staleTime: 5_000,
  });

  const mutation = useMutation({
    mutationFn: async (values: BuyFormValues) => {
      if (!connection || !address) throw new Error("Wallet not connected");
      if (!simulation) throw new Error("Price simulation not ready");

      const contractClient = await createContractClient(
        { rpcEndpoint: RPC_ENDPOINT, restEndpoint: REST_ENDPOINT, chainId: CHAIN_ID },
        connection
      );

      const amountUxyz = toUxyz(values.xyzAmount);
      const minTokensOut = computeMinOutput(
        simulation.tokens_out,
        values.slippage
      );

      return buyTokens(
        contractClient,
        address,
        tokenAddress,
        amountUxyz,
        minTokensOut
      );
    },
    onMutate: () => {
      toast.loading("Confirming purchase...", { id: "buy-tx" });
    },
    onSuccess: (result) => {
      toast.success("Purchase complete!", {
        id: "buy-tx",
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
      toast.error("Purchase failed", {
        id: "buy-tx",
        description: message.includes("insufficient funds")
          ? "Insufficient XYZ balance"
          : message.includes("min output")
          ? "Price moved -- try increasing slippage"
          : message,
      });
    },
  });

  const canSubmit =
    !!connection && !!simulation && !isSimulating && !mutation.isPending;

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
        className="space-y-6"
      >
        <FormField
          control={form.control}
          name="xyzAmount"
          render={({ field, fieldState }) => (
            <FormItem>
              <AmountInput
                value={field.value}
                onChange={field.onChange}
                label="Amount (XYZ)"
                denom="XYZ"
                presets={[100000, 500000, 1000000, 5000000]}
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
                  min={0.1}
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
            estimatedOutput={simulation.tokens_out}
            minOutput={computeMinOutput(simulation.tokens_out, slippage)}
            feeAmount={simulation.fee_amount}
            slippagePercent={slippage}
            outputDenom={tokenSymbol}
            outputIsXyz={false}
            newPrice={simulation.new_price}
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
            : "Buy"}
        </Button>
      </form>
    </Form>
  );
}
