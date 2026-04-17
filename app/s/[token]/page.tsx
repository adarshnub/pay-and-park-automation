import { SharedLotMobilePage } from "@/src/components/shared-lot/shared-lot-mobile-page";

export default async function SharedLotPublicPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <SharedLotMobilePage token={decodeURIComponent(token)} />;
}
