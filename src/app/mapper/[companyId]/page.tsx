import MapperScreen from "@/components/mapper/MapperScreen";

export default async function MapperPage({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = await params;
  return <MapperScreen companyId={companyId} />;
}
