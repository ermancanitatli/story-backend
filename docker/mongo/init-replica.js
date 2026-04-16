// Tek node replica set init. Script idempotent olacak sekilde tasarlandi.
// Public erisim icin host'u env'den alir: MONGO_RS_HOST (orn: mongo.example.com:27017)
try {
  const status = rs.status();
  if (status.ok === 1) {
    print("Replica set zaten aktif.");
  }
} catch (error) {
  const hostFromEnv =
    typeof process !== "undefined" &&
    process.env &&
    process.env.MONGO_RS_HOST
      ? process.env.MONGO_RS_HOST
      : "mongo:27017";

  const config = {
    _id: "rs0",
    members: [{ _id: 0, host: hostFromEnv }],
  };

  rs.initiate(config);
  print(`Replica set baslatildi. host=${hostFromEnv}`);
}
