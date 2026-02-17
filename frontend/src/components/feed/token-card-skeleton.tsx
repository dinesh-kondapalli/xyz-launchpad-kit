import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function TokenCardSkeleton() {
  return (
    <Card className="gap-0 overflow-hidden rounded-sm border-[#2a2a2a] bg-[#0a0a0a] py-0">
      <div className="aspect-square border-b border-[#1f1f1f] p-2">
        <Skeleton className="h-full w-full rounded-none" />
      </div>
      <CardHeader className="space-y-2 pb-2">
        <Skeleton className="h-3 w-24 rounded-sm" />
        <Skeleton className="h-5 w-32 rounded-sm" />
      </CardHeader>
      <CardContent className="space-y-3 pb-4">
        <Skeleton className="h-3 w-20 rounded-sm" />
        <Skeleton className="h-2 w-full rounded-none" />
        <div className="flex justify-between">
          <Skeleton className="h-3 w-16 rounded-sm" />
          <Skeleton className="h-3 w-14 rounded-sm" />
        </div>
      </CardContent>
    </Card>
  );
}
