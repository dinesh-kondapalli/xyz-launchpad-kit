import { CreateTokenForm } from "@/components/trading/create-token-form";

export default function CreateTokenPage() {
  return (
    <div className="w-full py-4">
      <div className="w-full rounded-2xl border border-zinc-900 bg-[#050505] p-6 sm:p-8">
        <div className="mx-auto w-full max-w-6xl">
          <h1 className="mb-2 text-3xl font-bold text-zinc-50">Create Token</h1>
          <p className="mb-8 text-zinc-400">
            Launch a new token on XYZ Chain&apos;s bonding curve
          </p>
          <CreateTokenForm />
        </div>
      </div>
    </div>
  );
}
