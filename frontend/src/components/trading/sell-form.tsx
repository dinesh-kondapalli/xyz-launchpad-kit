"use client";

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
import { simulateSell, sellTokens } from "@/lib/contract-clients/launchpad";
import { createContractClient } from "@xyz-chain/sdk";
import { RPC_ENDPOINT, REST_ENDPOINT, CHAIN_ID } from "@/lib/chain-config";
import { toUxyz, computeMinOutput } from "@/lib/utils";
import { sellFormSchema, type SellFormValues } from "@/lib/validation/trading-schemas";
import { AmountInput } from "./amount-input";
import { TradePreview } from "./trade-preview";
import { TOKENS_QUERY_KEY } from "@/hooks/use-tokens";
import { TOKEN_DETAIL_QUERY_KEY } from "@/hooks/use-token-detail";

interface SellFormProps {
  tokenAddress: string;
  tokenSymbol: string;
}

export function SellForm({ tokenAddress, tokenSymbol }: SellFormProps) {
  const queryClient = useQueryClient();
  const { connection, address, client, refreshBalance } = useWalletStore();

  const form = useForm<SellFormValues>({
    resolver: zodResolver(sellFormSchema),
    defaultValues: { tokenAmount: "", slippage: 1 },
  });

  const tokenAmount = useWatch({ control: form.control, name: "tokenAmount" });
  const slippage = useWatch({ control: form.control, name: "slippage" });

  // Real-time sell simulation
  const { data: simulation, isLoading: isSimulating } = useQuery({
    queryKey: ["simulate-sell", tokenAddress, tokenAmount],
    queryFn: () => {
      // Token amounts also use 6 decimals (CW20 standard on XYZ Chain)
      const amountMicro = toUxyz(tokenAmount);
      return simulateSell(client!, tokenAddress, amountMicro);
    },
    enabled:
      !!client &&
      !!tokenAmount &&
      !isNaN(Number(tokenAmount)) &&
      Number(tokenAmount) > 0,
    staleTime: 5_000,
  });

  const mutation = useMutation({
    mutationFn: async (values: SellFormValues) => {
      if (!connection || !address) throw new Error("Wallet not connected");
      if (!simulation) throw new Error("Price simulation not ready");

      const contractClient = await createContractClient(
        { rpcEndpoint: RPC_ENDPOINT, restEndpoint: REST_ENDPOINT, chainId: CHAIN_ID },
        connection
      );

      const amountMicro = toUxyz(values.tokenAmount);
      const minXyzOut = computeMinOutput(
        simulation.xyz_out,
        values.slippage
      );

      // IMPORTANT: Sells use CW20 Send pattern, not direct ExecuteMsg
      return sellTokens(
        contractClient,
        address,
        tokenAddress,
        amountMicro,
        minXyzOut
      );
    },
    onMutate: () => {
      toast.loading("Confirming sale...", { id: "sell-tx" });
    },
    onSuccess: (result) => {
      toast.success("Sale complete!", {
        id: "sell-tx",
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
      toast.error("Sale failed", {
        id: "sell-tx",
        description: message.includes("insufficient")
          ? "Insufficient token balance"
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
          name="tokenAmount"
          render={({ field, fieldState }) => (
            <FormItem>
              <AmountInput
                value={field.value}
                onChange={field.onChange}
                label={`Amount (${tokenSymbol})`}
                denom={tokenSymbol}
                presets={[10, 100, 1000, 10000]}
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
            estimatedOutput={simulation.xyz_out}
            minOutput={computeMinOutput(simulation.xyz_out, slippage)}
            feeAmount={simulation.fee_amount}
            slippagePercent={slippage}
            outputDenom="XYZ"
            outputIsXyz={true}
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
            : "Sell"}
        </Button>
      </form>
    </Form>
  );
}
