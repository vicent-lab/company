import { query } from '../db/index.js';

// Gives a "student / demo" signup something real to look at immediately — a small but
// genuine farm (cows, milk history, feed, breeding, live-map zone assignments) generated
// the same way database/seeds/001_demo.sql seeds the main demo farms, just condensed and
// driven from Node so it can run in a couple of seconds at registration time instead of
// needing the full seed script. Every value here is really written to the database; none
// of it is display-only fake data layered on top.
const NAMES = ['Bella', 'Daisy', 'Lola', 'Molly', 'Rosie', 'Buttercup', 'Clover', 'Penny', 'Ruby', 'Ginger', 'Luna', 'Maple', 'Hazel', 'Olive', 'Pearl'];
const BREEDS = ['Holstein', 'Jersey', 'Guernsey', 'Ayrshire', 'Brown Swiss', 'Fleckvieh'];
const ZONES_FOR = { healthy_milking: ['barnA', 'milk', 'graze1', 'graze2'], healthy_dry: ['barnB', 'graze2'], unhealthy: ['vet'] };
const ACTIVITY_FOR = { healthy_milking: ['eating', 'grazing', 'milking', 'resting'], healthy_dry: ['resting', 'grazing'], unhealthy: ['sick_bay'] };

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function between(a: number, b: number) { return a + Math.random() * (b - a); }
function daysAgo(n: number) { return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10); }
function daysFromNow(n: number) { return new Date(Date.now() + n * 86400000).toISOString().slice(0, 10); }

export async function provisionDemoFarm(ownerFirstName: string): Promise<{ farmId: string; farmName: string }> {
  const farmName = `${ownerFirstName}'s Sandbox Farm`;
  const farm = await query<{ id: string }>(
    `INSERT INTO farms (name, address) VALUES ($1, 'Demo Valley') RETURNING id`,
    [farmName]
  );
  const farmId = farm.rows[0].id;

  const barnA = await query<{ id: string }>(`INSERT INTO barns (farm_id, name, capacity) VALUES ($1,'Barn A',30) RETURNING id`, [farmId]);
  const barnB = await query<{ id: string }>(`INSERT INTO barns (farm_id, name, capacity) VALUES ($1,'Barn B',20) RETURNING id`, [farmId]);
  const barnIds = [barnA.rows[0].id, barnB.rows[0].id];

  const feedTypes = await query<{ id: string; name: string }>(
    `INSERT INTO feed_types (farm_id, name, unit, reorder_level)
     VALUES ($1,'Silage','kg',500),($1,'Hay','kg',300),($1,'Concentrate','kg',200)
     RETURNING id, name`,
    [farmId]
  );
  for (const ft of feedTypes.rows) {
    await query(`INSERT INTO feed_inventory (feed_type_id, quantity, unit_cost) VALUES ($1,$2,$3)`, [ft.id, Math.round(between(1200, 3000)), +between(0.3, 0.9).toFixed(2)]);
  }

  const cowCount = 14;
  for (let i = 1; i <= cowCount; i++) {
    const gender = Math.random() < 0.85 ? 'female' : 'male';
    const health = Math.random() < 0.8 ? 'healthy' : pick(['sick', 'under_treatment']);
    const isMilking = gender === 'female' && Math.random() < 0.7;
    const isPregnant = gender === 'female' && Math.random() < 0.3;
    const cow = await query<{ id: string }>(
      `INSERT INTO cows (farm_id, barn_id, cow_code, ear_tag, name, breed, gender, date_of_birth, weight_kg, status, health, is_milking, is_pregnant, water_intake_liters)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'active',$10,$11,$12,$13) RETURNING id`,
      [
        farmId, pick(barnIds), `DEMO-${String(i).padStart(3, '0')}`, `ETD${10000 + i}`,
        pick(NAMES), pick(BREEDS), gender, daysAgo(400 + Math.floor(Math.random() * 2000)),
        Math.round(between(380, 720)), health, isMilking, isPregnant, Math.round(between(40, 100)),
      ]
    );
    const cowId = cow.rows[0].id;

    if (isMilking) {
      const base = between(14, 32);
      for (let d = 6; d >= 0; d--) {
        const wobble = 1 + (Math.random() - 0.5) * 0.25;
        const total = base * wobble;
        await query(
          `INSERT INTO milk_records (farm_id, cow_id, recorded_on, morning_liters, afternoon_liters, evening_liters, fat_percent, snf_percent)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (cow_id, recorded_on) DO NOTHING`,
          [farmId, cowId, daysAgo(d), +(total * 0.4).toFixed(1), +(total * 0.35).toFixed(1), +(total * 0.25).toFixed(1), +between(3.6, 4.4).toFixed(2), +between(8.4, 9).toFixed(2)]
        );
        await query(
          `INSERT INTO feed_consumption (cow_id, feed_type_id, consumed_on, quantity) VALUES ($1,$2,$3,$4)`,
          [cowId, pick(feedTypes.rows).id, daysAgo(d), +between(18, 28).toFixed(1)]
        );
      }
    }

    if (health !== 'healthy') {
      await query(
        `INSERT INTO treatments (cow_id, diagnosis, diagnosed_on, veterinarian_name) VALUES ($1,'Monitored and treated',$2,$3)`,
        [cowId, daysAgo(Math.floor(Math.random() * 10) + 1), pick(['Dr. Smith', 'Dr. Johnson', 'Dr. Williams'])]
      );
    }
    if (isPregnant) {
      await query(
        `INSERT INTO breeding_records (cow_id, method, serviced_on, expected_calving_on, result) VALUES ($1,$2,$3,$4,'Pregnant')`,
        [cowId, pick(['AI', 'Natural']), daysAgo(60 + Math.floor(Math.random() * 150)), daysFromNow(10 + Math.floor(Math.random() * 100))]
      );
    }

    const zoneGroup = health !== 'healthy' ? 'unhealthy' : isMilking ? 'healthy_milking' : 'healthy_dry';
    await query(
      `INSERT INTO cow_locations (farm_id, cow_id, zone, activity, source) VALUES ($1,$2,$3,$4,'manual') ON CONFLICT (cow_id) DO NOTHING`,
      [farmId, cowId, pick(ZONES_FOR[zoneGroup]), pick(ACTIVITY_FOR[zoneGroup])]
    );
  }

  await query(
    `INSERT INTO notifications (farm_id, type, title, body) VALUES
     ($1,'vaccination','Vaccination due','A booster is due this week for one of your cows.'),
     ($1,'feed','Feed stock check','Review concentrate stock levels for the week ahead.')`,
    [farmId]
  );

  return { farmId, farmName };
}
