import MinuteDetailClient from "./MinuteDetailClient";

export default function Page({ params }: { params: { date: string } }) {
  return <MinuteDetailClient date={params.date} />;
}
