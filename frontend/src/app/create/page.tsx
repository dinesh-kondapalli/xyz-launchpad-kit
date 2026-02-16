import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { CreateTokenForm } from "@/components/trading/create-token-form";

export default function CreateTokenPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1 mx-auto w-full max-w-6xl px-6 py-8 lg:px-10">
        <div className="max-w-lg mx-auto">
          <h1 className="text-3xl font-bold mb-2">Create Token</h1>
          <p className="text-muted-foreground mb-8">
            Launch a new token on XYZ Chain&apos;s bonding curve
          </p>
          <CreateTokenForm />
        </div>
      </main>
      <Footer />
    </div>
  );
}
