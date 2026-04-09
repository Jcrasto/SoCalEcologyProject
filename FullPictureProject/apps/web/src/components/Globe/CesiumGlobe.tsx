import { Viewer, Entity, PointGraphics } from "resium";
import { Cartesian3, Color } from "cesium";
import type { DataResponse } from "../../types/sources";

interface Props {
  sourceId: string;
  data: DataResponse | undefined;
}

interface LocationPoint {
  lat: number;
  lon: number;
  label: string;
}

function extractPoints(rows: Record<string, unknown>[]): LocationPoint[] {
  return rows
    .filter((r) => typeof r.lat === "number" && typeof r.lon === "number")
    .slice(0, 500)
    .map((r) => ({
      lat: r.lat as number,
      lon: r.lon as number,
      label: String(r.city ?? r.state ?? r.country ?? ""),
    }));
}

export function CesiumGlobe({ data }: Props) {
  const points = extractPoints(data?.rows ?? []);

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <Viewer style={{ width: "100%", height: "100%" }}>
        {points.map((pt, i) => (
          <Entity
            key={i}
            position={Cartesian3.fromDegrees(pt.lon, pt.lat)}
            name={pt.label}
          >
            <PointGraphics
              pixelSize={8}
              color={Color.DODGERBLUE.withAlpha(0.8)}
              outlineColor={Color.WHITE}
              outlineWidth={1}
            />
          </Entity>
        ))}
      </Viewer>
    </div>
  );
}
