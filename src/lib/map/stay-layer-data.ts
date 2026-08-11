export type StayPoint = {
  id: number;
  name: string;
  city: string | null;
  country: string | null;
  checkIn: string;
  checkOut: string;
  position: [number, number];
};

type StayLike = {
  id: number;
  name: string;
  city: string | null;
  country: string | null;
  checkIn: string;
  checkOut: string;
  lat: number | null;
  lon: number | null;
};

/** Stays without coordinates (failed geocode) cannot be plotted. */
export const prepareStayPoints = (stays: StayLike[]): StayPoint[] =>
  stays.flatMap((stay) =>
    stay.lat !== null && stay.lon !== null
      ? [
          {
            id: stay.id,
            name: stay.name,
            city: stay.city,
            country: stay.country,
            checkIn: stay.checkIn,
            checkOut: stay.checkOut,
            position: [stay.lon, stay.lat] as [number, number],
          },
        ]
      : [],
  );
