"use client";

import { useState, useRef, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Loader2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useWalletStore } from "@/stores/wallet-store";
import { createToken, getConfig } from "@/lib/contract-clients/launchpad";
import { createContractClient } from "@xyz-chain/sdk";
import { RPC_ENDPOINT, REST_ENDPOINT, CHAIN_ID } from "@/lib/chain-config";
import { fromUxyz, formatUsd } from "@/lib/utils";
import { useXyzPrice } from "@/hooks/use-xyz-price";
import {
  createTokenSchema,
  type CreateTokenFormValues,
} from "@/lib/validation/trading-schemas";
import { TOKENS_QUERY_KEY } from "@/hooks/use-tokens";

export function CreateTokenForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { connection, address, client, refreshBalance } = useWalletStore();
  const { xyzPriceUsd } = useXyzPrice();

  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Query launchpad config to get current creation fee (no wallet needed)
  const { data: config } = useQuery({
    queryKey: ["launchpad-config"],
    queryFn: async () => {
      const { createClient } = await import("@xyz-chain/sdk");
      const readClient = await createClient({ rpcEndpoint: RPC_ENDPOINT, restEndpoint: REST_ENDPOINT, chainId: CHAIN_ID });
      const result = await getConfig(readClient);
      readClient.disconnect();
      return result;
    },
    staleTime: 60_000, // Config rarely changes
  });

  const creationFee = config?.creation_fee ?? "0";
  const creationFeeDisplay = fromUxyz(creationFee);
  const creationFeeUsd = formatUsd(creationFeeDisplay * xyzPriceUsd);

  const form = useForm<CreateTokenFormValues>({
    resolver: zodResolver(createTokenSchema),
    defaultValues: {
      name: "",
      symbol: "",
      image: "",
      description: "",
      socialLinks: "",
    },
  });

  const handleFileUpload = useCallback(
    async (file: File) => {
      if (!file.type.startsWith("image/")) {
        toast.error("Please upload an image file (PNG, JPG, GIF, WebP, SVG)");
        return;
      }
      if (file.size > 2 * 1024 * 1024) {
        toast.error("Image must be under 2MB");
        return;
      }

      // Show local preview immediately
      const localPreview = URL.createObjectURL(file);
      setImagePreview(localPreview);
      setIsUploading(true);

      try {
        const formData = new FormData();
        formData.append("file", file);

        const res = await fetch("/api/upload", { method: "POST", body: formData });
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || "Upload failed");
        }

        form.setValue("image", data.url, { shouldValidate: true });
        // Replace blob preview with server URL
        URL.revokeObjectURL(localPreview);
        setImagePreview(data.url);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Upload failed");
        URL.revokeObjectURL(localPreview);
        setImagePreview(null);
        form.setValue("image", "", { shouldValidate: true });
      } finally {
        setIsUploading(false);
      }
    },
    [form]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFileUpload(file);
    },
    [handleFileUpload]
  );

  const handleRemoveImage = useCallback(() => {
    setImagePreview(null);
    form.setValue("image", "", { shouldValidate: true });
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [form]);

  const mutation = useMutation({
    mutationFn: async (values: CreateTokenFormValues) => {
      if (!connection || !address) throw new Error("Wallet not connected");
      if (!creationFee || creationFee === "0") {
        throw new Error("Creation fee not loaded");
      }

      const contractClient = await createContractClient(
        { rpcEndpoint: RPC_ENDPOINT, restEndpoint: REST_ENDPOINT, chainId: CHAIN_ID },
        connection
      );

      const socialLinksArray = values.socialLinks
        ? values.socialLinks.split(",").map((s) => s.trim()).filter(Boolean)
        : [];

      return createToken(
        contractClient,
        address,
        {
          name: values.name,
          symbol: values.symbol,
          image: values.image,
          description: values.description || "",
          socialLinks: socialLinksArray,
        },
        creationFee
      );
    },
    onMutate: () => {
      toast.loading("Creating token...", { id: "create-token" });
    },
    onSuccess: (_data, variables) => {
      toast.success("Token created!", {
        id: "create-token",
        description: "Your token is now live on the bonding curve.",
      });
      refreshBalance();
      queryClient.invalidateQueries({ queryKey: TOKENS_QUERY_KEY });

      // Notify Telegram (fire-and-forget)
      fetch("/api/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: variables.name,
          symbol: variables.symbol,
          creator: address,
          image: variables.image,
        }),
      }).catch(() => {});

      router.push("/");
    },
    onError: (error) => {
      const message =
        error instanceof Error ? error.message : "Unknown error";
      toast.error("Failed to create token", {
        id: "create-token",
        description: message.includes("insufficient funds")
          ? `Insufficient balance. Creation fee is ${creationFeeUsd}`
          : message,
      });
    },
  });

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
        className="space-y-6"
      >
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Token Name</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  placeholder="My Awesome Token"
                  disabled={mutation.isPending}
                />
              </FormControl>
              <FormDescription>
                The full name of your token (max 32 characters)
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="symbol"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Symbol</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  placeholder="MAT"
                  onChange={(e) =>
                    field.onChange(e.target.value.toUpperCase())
                  }
                  disabled={mutation.isPending}
                />
              </FormControl>
              <FormDescription>
                Ticker symbol, uppercase letters and numbers only (max 10)
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="image"
          render={() => (
            <FormItem>
              <FormLabel>Token Image</FormLabel>
              <FormControl>
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragOver(true);
                  }}
                  onDragLeave={() => setIsDragOver(false)}
                  onDrop={handleDrop}
                  onClick={() =>
                    !isUploading &&
                    !imagePreview &&
                    fileInputRef.current?.click()
                  }
                  className={`relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 transition-colors ${
                    isDragOver
                      ? "border-primary bg-primary/5"
                      : imagePreview
                      ? "border-muted"
                      : "border-muted-foreground/25 hover:border-muted-foreground/50 cursor-pointer"
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml"
                    className="hidden"
                    disabled={mutation.isPending || isUploading}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileUpload(file);
                    }}
                  />

                  {isUploading ? (
                    <div className="flex flex-col items-center gap-2 py-4">
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">
                        Uploading...
                      </p>
                    </div>
                  ) : imagePreview ? (
                    <div className="relative">
                      <img
                        src={imagePreview}
                        alt="Token preview"
                        className="h-32 w-32 rounded-lg object-cover"
                      />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveImage();
                        }}
                        className="absolute -right-2 -top-2 rounded-full bg-destructive p-1 text-destructive-foreground shadow-sm hover:bg-destructive/90"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2 py-4">
                      <Upload className="h-8 w-8 text-muted-foreground" />
                      <div className="text-center">
                        <p className="text-sm font-medium">
                          Drop image here or click to browse
                        </p>
                        <p className="text-xs text-muted-foreground">
                          PNG, JPG, GIF, WebP, SVG (max 2MB)
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description (optional)</FormLabel>
              <FormControl>
                <Textarea
                  {...field}
                  placeholder="Describe what makes your token unique..."
                  rows={4}
                  disabled={mutation.isPending}
                />
              </FormControl>
              <FormDescription>
                Up to 500 characters describing your token
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="socialLinks"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Social Links (optional)</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  placeholder="https://twitter.com/..., https://discord.gg/..."
                  disabled={mutation.isPending}
                />
              </FormControl>
              <FormDescription>
                Comma-separated URLs for your community channels
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="rounded-md bg-muted p-4 text-sm space-y-1">
          <p className="font-medium">
            Creation Fee: {creationFeeDisplay > 0 ? creationFeeUsd : "Loading..."}
          </p>
          <p className="text-muted-foreground">
            This fee is paid to create the bonding curve for your token.
          </p>
        </div>

        <Button
          type="submit"
          className="w-full"
          disabled={!connection || mutation.isPending || !config}
        >
          {!connection
            ? "Connect Wallet"
            : mutation.isPending
            ? "Creating..."
            : "Create Token"}
        </Button>
      </form>
    </Form>
  );
}
