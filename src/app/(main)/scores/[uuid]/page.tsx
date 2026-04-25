import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";


export default async function Home({ params }: Readonly<{ params: { uuid: string } }>) {
  const {uuid} = await params;
  return (
    <div className="w-full h-full flex items-center justify-center">
      <Card>
        <CardHeader>
          <div className="w-full flex flex-col">
            <div className="w-fit flex flex-row items-center justify-between gap-4">
              <h2 className="text-3xl font-semibold">Genesis 8.318</h2>
              <Badge variant="fwr">🏆 WR</Badge>
              <Badge variant="approved">Approved</Badge>
              <Badge variant="outline">Pending</Badge>
              <Badge variant="denied">Denied</Badge>
            </div>
            <p className="text-lg text-muted-foreground">Tel Aviv</p>
          </div>
        </CardHeader>
        <CardContent>
          <video controls src={`https://assets.wasans.tully.sh/scores/${uuid}.mp4`} />
        </CardContent>
        {/* <CardFooter>
          <div className="w-full flex items-center justify-between">
            <Badge variant="destructive">DDT</Badge>
          </div>
        </CardFooter> */}
      </Card>
    </div>
  );
}
