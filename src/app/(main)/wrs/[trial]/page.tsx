export default async function Home({ params }: Readonly<{ params: { trial: string } }>) {
  const {trial} = await params;
  return (
    <div className="w-full h-full flex items-center justify-center">
      <p className="w-full text-center text-l lg:text-2xl lg:p-32">
  hi i wasans i'm trying to explain my wrs for {trial}
      </p>
    </div>
  );
}
