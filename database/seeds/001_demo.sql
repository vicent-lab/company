-- Roles, permissions and grants
INSERT INTO roles (name, description) VALUES
  ('administrator','Full access'),
  ('farm_manager','Operations'),
  ('veterinarian','Health care'),
  ('worker','Daily records'),
  ('accountant','Finance')
ON CONFLICT (name) DO NOTHING;

INSERT INTO permissions (code) VALUES
  ('farm:manage'),('cow:manage'),('milk:write'),('health:manage'),('finance:manage')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name='administrator'
ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name='farm_manager' AND p.code IN ('cow:manage','milk:write','health:manage')
ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name='veterinarian' AND p.code IN ('health:manage','cow:manage')
ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name='worker' AND p.code IN ('milk:write')
ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name='accountant' AND p.code IN ('finance:manage')
ON CONFLICT DO NOTHING;

-- Farms (deterministic UUIDs so the web app can switch between them)
INSERT INTO farms (id, name, address, phone) VALUES
  ('00000000-0000-0000-0000-000000000001','Greenfield Dairy','Waikato, NZ','+64 7 000 0001'),
  ('00000000-0000-0000-0000-000000000002','Sunrise Holsteins','Wisconsin, US','+1 608 000 0002'),
  ('00000000-0000-0000-0000-000000000003','Highland Ayrshires','Ayr, Scotland','+44 1292 000 003')
ON CONFLICT (id) DO NOTHING;

-- Barns per farm
INSERT INTO barns (id, farm_id, name, capacity) VALUES
  ('00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000001','Main Barn',80),
  ('00000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-000000000001','Dry Barn',40),
  ('00000000-0000-0000-0000-000000000020','00000000-0000-0000-0000-000000000002','North Barn',70),
  ('00000000-0000-0000-0000-000000000021','00000000-0000-0000-0000-000000000002','Calving Barn',30),
  ('00000000-0000-0000-0000-000000000030','00000000-0000-0000-0000-000000000003','Hill Barn',50)
ON CONFLICT (id) DO NOTHING;

-- Users
INSERT INTO users (farm_id, role_id, name, email, password_hash, email_verified_at) VALUES
  ('00000000-0000-0000-0000-000000000001', (SELECT id FROM roles WHERE name='administrator'), 'System Administrator','admin@greenfield.test', crypt('ChangeMe123!', gen_salt('bf')), now()),
  ('00000000-0000-0000-0000-000000000001', (SELECT id FROM roles WHERE name='farm_manager'), 'Maria Alvarez','manager@greenfield.test', crypt('ChangeMe123!', gen_salt('bf')), now()),
  ('00000000-0000-0000-0000-000000000002', (SELECT id FROM roles WHERE name='administrator'), 'James Whitlock','admin@sunrise.test', crypt('ChangeMe123!', gen_salt('bf')), now()),
  ('00000000-0000-0000-0000-000000000003', (SELECT id FROM roles WHERE name='farm_manager'), 'Priya Nair','manager@highland.test', crypt('ChangeMe123!', gen_salt('bf')), now())
ON CONFLICT (email) DO NOTHING;

-- Disease dictionary
INSERT INTO diseases (name, description) VALUES
  ('Mastitis','Udder inflammation'),
  ('Lameness','Hoof or leg disorder'),
  ('Metritis','Uterine infection'),
  ('Respiratory','Breathing infection')
ON CONFLICT (name) DO NOTHING;

-- Idempotent cleanup of previously generated demo data (users/roles/farms/barns kept).
-- TRUNCATE ... CASCADE clears every table that hangs off cows/feed_types/employees/customers
-- (milk records, vaccinations, treatments, breeding, feed stock, attendance, sales, etc.)
-- regardless of each FK's own ON DELETE setting, so new migrations never need this list updated.
DELETE FROM notifications WHERE farm_id IN (SELECT id FROM farms);
DELETE FROM income WHERE farm_id IN (SELECT id FROM farms);
DELETE FROM expenses WHERE farm_id IN (SELECT id FROM farms);
TRUNCATE TABLE cows, feed_types, employees, customers CASCADE;

-- Generate cows, milk records, feed, finance, vaccinations, treatments, breeding, notifications
DO $$
DECLARE
  f RECORD;
  i INT;
  breed TEXT; gender TEXT; health TEXT; code TEXT; tag TEXT;
  base NUMERIC; born DATE; is_milk BOOLEAN; is_preg BOOLEAN;
  v_acc TEXT[];
  bid UUID;
BEGIN
  v_acc := ARRAY['FMD','Brucellosis','BVD','Leptospirosis','Clostridial','IBR'];
  FOR f IN
    SELECT id, row_number() OVER () AS rn,
      CASE WHEN name='Greenfield Dairy' THEN 60 WHEN name='Sunrise Holsteins' THEN 48 ELSE 38 END AS n
    FROM farms
  LOOP
    FOR i IN 1..f.n LOOP
      breed := (ARRAY['Holstein','Jersey','Guernsey','Ayrshire','Brown Swiss','Fleckvieh'])[1+floor(random()*6)::int];
      gender := CASE WHEN random()<0.82 THEN 'female' ELSE 'male' END;
      health := CASE WHEN random()<0.80 THEN 'healthy' ELSE (ARRAY['sick','under_treatment'])[1+floor(random()*2)::int] END;
      code := (ARRAY['GF','SH','HL'])[f.rn] || '-' || lpad(i::text,3,'0');
      tag  := 'ET' || (f.rn*100000 + i);
      born := current_date - (400 + floor(random()*2000))::int;
      is_milk := (gender='female' AND random()<0.72);
      is_preg := (gender='female' AND random()<0.40);
      SELECT id INTO bid FROM barns WHERE farm_id=f.id ORDER BY random() LIMIT 1;
      INSERT INTO cows (farm_id, barn_id, cow_code, ear_tag, name, breed, gender, date_of_birth, weight_kg, status, health, is_milking, is_pregnant, water_intake_liters)
      VALUES (
        f.id,
        bid,
        code, tag,
        (ARRAY['Bella','Daisy','Lola','Molly','Rosie','Buttercup','Clover','Penny','Ruby','Ginger','Luna','Maple','Hazel','Olive','Pearl','Willow','Ivy','Nina','Coco','Sasha','Tilly','Fern','Jade','Sienna','Zoe','Cleo','Mia','Rosi','Annie','Goldie','Blue','Violet','Tess','Nell','Poppy','Wren','Star','Marigold','Winnie','Dottie','Betsy','Flossie','Maisie','Bonnie','Cinnamon','Juniper'])[1+floor(random()*46)::int],
        breed, gender, born, 380 + floor(random()*340)::int, 'active'::cow_status, health::health_status, is_milk, is_preg, 40 + floor(random()*60)::int
      )
      ON CONFLICT (farm_id, cow_code) DO NOTHING;

      -- milk records for the last 30 days (milking females only)
      IF is_milk THEN
        base := 14 + random()*20;
        INSERT INTO milk_records (farm_id, cow_id, recorded_on, morning_liters, afternoon_liters, evening_liters, fat_percent, snf_percent)
        SELECT f.id, c.id, d::date,
          round(base*0.4*(1+(random()-0.5)*0.2)::numeric,1),
          round(base*0.35*(1+(random()-0.5)*0.2)::numeric,1),
          round(base*0.25*(1+(random()-0.5)*0.2)::numeric,1),
          round((3.6+random()*0.8)::numeric,2),
          round((8.4+random()*0.6)::numeric,2)
        FROM cows c, generate_series(current_date-29, current_date, '1 day') d
        WHERE c.farm_id=f.id AND c.cow_code=code;
      END IF;

      -- vaccinations
      INSERT INTO vaccinations (cow_id, vaccine_name, due_on, administered_on)
      SELECT c.id, v, current_date + (10 + floor(random()*200))::int,
        CASE WHEN random()<0.6 THEN current_date - (30+floor(random()*300))::int ELSE NULL END
      FROM cows c, unnest(v_acc) v WHERE c.farm_id=f.id AND c.cow_code=code;

      -- treatments for unhealthy cows
      IF health <> 'healthy' THEN
        INSERT INTO treatments (cow_id, disease_id, diagnosis, diagnosed_on, veterinarian_name)
        SELECT c.id, NULL,
          'Monitored and treated', current_date - (1+floor(random()*20))::int,
          (ARRAY['Dr. Smith','Dr. Johnson','Dr. Williams','Dr. Brown','Dr. Davis'])[1+floor(random()*5)::int]
        FROM cows c WHERE c.farm_id=f.id AND c.cow_code=code;
      END IF;

      -- breeding for pregnant cows
      IF is_preg THEN
        INSERT INTO breeding_records (cow_id, method, breeding_date, expected_calving_on, result)
        SELECT c.id, (ARRAY['AI','Natural','ET'])[1+floor(random()*3)::int],
          current_date - (60+floor(random()*240))::int,
          current_date + (10+floor(random()*120))::int, 'Pregnant'
        FROM cows c WHERE c.farm_id=f.id AND c.cow_code=code;
      END IF;

      -- heat detection for a slice of open, healthy females (drives "ready for breeding")
      IF gender = 'female' AND NOT is_preg AND health = 'healthy' AND random() < 0.12 THEN
        INSERT INTO heat_detections (farm_id, cow_id, detected_on, confidence, sensor_type, activity_level, temperature_c)
        VALUES (
          f.id,
          (SELECT c.id FROM cows c WHERE c.farm_id=f.id AND c.cow_code=code),
          now() - (random() * interval '2 days'),
          round((0.6 + random()*0.35)::numeric, 2),
          'wearable',
          round((60 + random()*40)::numeric, 1),
          round((38.2 + random()*0.8)::numeric, 1)
        );
      END IF;

      -- calving history: non-pregnant females may show a recent calving (drives "recently
      -- calved" on the map); pregnant females may carry an older one (rebred after the
      -- normal postpartum window) so "history of a difficult calving" can feed calving risk
      -- even while a cow is currently pregnant again.
      IF gender = 'female' AND ((NOT is_preg AND random() < 0.35) OR (is_preg AND random() < 0.25)) THEN
        INSERT INTO calves (farm_id, mother_id, born_on, birth_weight_kg, gender, status)
        VALUES (
          f.id,
          (SELECT c.id FROM cows c WHERE c.farm_id=f.id AND c.cow_code=code),
          CASE
            WHEN is_preg THEN current_date - (60 + floor(random()*440))::int
            WHEN random() < 0.25 THEN current_date - floor(random()*14)::int
            ELSE current_date - (30 + floor(random()*470))::int
          END,
          round((28 + random()*15)::numeric, 1),
          (ARRAY['female','male'])[1+floor(random()*2)::int],
          'active'
        );

        INSERT INTO calving_records (farm_id, cow_id, calving_date, difficulty_score, assistance_required, calf_id)
        SELECT f.id, cal.mother_id, cal.born_on, d.difficulty, d.difficulty >= 4, cal.id
        FROM calves cal
        CROSS JOIN LATERAL (SELECT (CASE WHEN random() < 0.15 THEN 4 + floor(random()*2)::int ELSE 1 + floor(random()*2)::int END) AS difficulty) d
        WHERE cal.mother_id = (SELECT c.id FROM cows c WHERE c.farm_id=f.id AND c.cow_code=code)
        ORDER BY cal.born_on DESC LIMIT 1;
      END IF;

      -- live location: manual zone assignment today, ready for a future RFID/GPS feed
      INSERT INTO cow_locations (farm_id, cow_id, zone, activity, source)
      VALUES (
        f.id,
        (SELECT c.id FROM cows c WHERE c.farm_id=f.id AND c.cow_code=code),
        CASE
          WHEN health <> 'healthy' THEN 'vet'
          WHEN is_milk THEN (ARRAY['barnA','milk','graze1','graze2'])[1+floor(random()*4)::int]
          ELSE (ARRAY['barnB','graze2'])[1+floor(random()*2)::int]
        END,
        CASE
          WHEN health <> 'healthy' THEN 'sick_bay'
          WHEN is_milk THEN (ARRAY['eating','grazing','milking','resting'])[1+floor(random()*4)::int]
          ELSE (ARRAY['resting','grazing'])[1+floor(random()*2)::int]
        END,
        'manual'
      )
      ON CONFLICT (cow_id) DO NOTHING;
    END LOOP;

    -- feed types & inventory
    INSERT INTO feed_types (farm_id, name, unit, reorder_level) VALUES
      (f.id,'Silage','kg',500),(f.id,'Hay','kg',300),(f.id,'Concentrate','kg',200),(f.id,'Alfalfa','kg',150),(f.id,'Maize','kg',250)
    ON CONFLICT (farm_id, name) DO NOTHING;
    INSERT INTO feed_inventory (feed_type_id, quantity, unit_cost)
    SELECT ft.id, (800+floor(random()*2500))::int, round((0.2+random()*0.8)::numeric,2)
    FROM feed_types ft WHERE ft.farm_id=f.id
    ON CONFLICT DO NOTHING;

    -- per-cow feed consumption for the last 30 days (matches milk_records' depth so the
    -- feed heat map layer can scrub back a full month, not just a couple of days; sick cows
    -- eat less, milking cows eat most, matching real appetite patterns)
    INSERT INTO feed_consumption (cow_id, feed_type_id, consumed_on, quantity)
    SELECT c.id,
      (SELECT id FROM feed_types WHERE farm_id=f.id ORDER BY random() LIMIT 1),
      d::date,
      CASE
        WHEN c.health <> 'healthy' THEN 8 + random()*6
        WHEN c.is_milking THEN 20 + random()*10
        ELSE 14 + random()*8
      END
    FROM cows c, generate_series(current_date-29, current_date, '1 day') d
    WHERE c.farm_id=f.id;

    -- finance: 12 months of income & expense
    INSERT INTO income (farm_id, category, amount, received_on, notes)
    SELECT f.id, (ARRAY['Milk sales','Calf sales','Manure','Grants'])[1+floor(random()*4)::int],
      (3000+floor(random()*6000))::int, (date_trunc('month', current_date) - (m||' months')::interval)::date, 'auto-seeded'
    FROM generate_series(0,11) m;
    INSERT INTO expenses (farm_id, category, amount, incurred_on, notes)
    SELECT f.id, (ARRAY['Feed','Labor','Vet & Medicine','Utilities','Other'])[1+floor(random()*5)::int],
      (2000+floor(random()*4000))::int, (date_trunc('month', current_date) - (m||' months')::interval)::date, 'auto-seeded'
    FROM generate_series(0,11) m;

    -- notifications
    INSERT INTO notifications (farm_id, type, title, body)
    VALUES
      (f.id,'vaccination','Vaccination due','Leptospirosis booster due this week.'),
      (f.id,'heat','Heat detected','A cow is showing strong estrus signs.'),
      (f.id,'calving','Expected calving','A cow is due to calve within a few days.'),
      (f.id,'sick','Sick cow alert','A cow is flagged under treatment.'),
      (f.id,'feed','Low feed stock','Concentrate below reorder level.'),
      (f.id,'medicine','Medicine expiring','A medicine expires soon.'),
      (f.id,'task','Task reminder','Afternoon milking roster is due.'),
      (f.id,'payment','Payment due','A supplier invoice is due soon.');

    -- customers, sales, employees, attendance
    INSERT INTO customers (farm_id, name, phone, email)
    VALUES
      (f.id,'FreshMart','+1 555 0101','buyer@freshmart.com'),
      (f.id,'DairyCo','+1 555 0102','buyer@dairyco.com'),
      (f.id,'MorningLight','+1 555 0103','buyer@morninglight.com'),
      (f.id,'PurePint','+1 555 0104','buyer@purepint.com')
    ON CONFLICT DO NOTHING;
    INSERT INTO sales (farm_id, customer_id, sale_type, sale_date, quantity, unit_price, total_amount, payment_status)
    SELECT f.id, c.id, 'milk', (current_date - (1+floor(random()*60))::int), (20+floor(random()*60))::int, 0.45,
      round((20+floor(random()*60))::int * 0.45, 2),
      (ARRAY['paid','paid','paid','pending','overdue'])[1+floor(random()*5)::int]
    FROM customers c WHERE c.farm_id=f.id;

    INSERT INTO employees (farm_id, job_title, hired_on, base_salary)
    VALUES
      (f.id,'Herd Manager', current_date - 400, 4200),
      (f.id,'Milker', current_date - 300, 3000),
      (f.id,'Vet Tech', current_date - 250, 3600),
      (f.id,'Feeder', current_date - 200, 2800),
      (f.id,'Mechanic', current_date - 150, 3300)
    ON CONFLICT DO NOTHING;
    INSERT INTO attendance (employee_id, attended_on, status)
    SELECT e.id, current_date - g, (CASE WHEN random()<0.94 THEN 'present' ELSE 'absent' END)
    FROM employees e, generate_series(0,29) g WHERE e.farm_id=f.id;
  END LOOP;

  -- Sample AI insights for Greenfield (farm 1)
  INSERT INTO ai_insights (farm_id, type, category, severity, priority, title, description, action_items, confidence_score, expires_at, metadata)
  VALUES
    ('00000000-0000-0000-0000-000000000001', 'warning', 'health', 'high', 4,
     'Cow GF-003 showing declining health trend',
     'GF-003 has been under treatment for 4 days. Monitor response to antibiotics. If no improvement by end of week, escalate to senior vet.',
     '[{"label":"Monitor GF-003 vitals daily","done":false},{"label":"Schedule vet review by Friday","done":false}]'::jsonb,
     0.88, now() + interval '7 days', '{"cow_id":"GF-003"}'::jsonb),
    ('00000000-0000-0000-0000-000000000001', 'recommendation', 'milk_production', 'medium', 2,
     'Top 3 producers identified for breeding selection',
     'GF-012, GF-045, and GF-089 are consistently in the top 10% for milk yield. Consider using these animals for genetic selection and embryo transfer programs.',
     '[{"label":"Review breeding records for top producers","done":false},{"label":"Schedule semen order for top cows","done":false}]'::jsonb,
     0.92, now() + interval '14 days', '{}'::jsonb),
    ('00000000-0000-0000-0000-000000000001', 'warning', 'feed_nutrition', 'critical', 4,
     'Concentrate feed stock critically low',
     'Current concentrate stock is 480 kg against reorder level of 2000 kg. At current consumption (~180 kg/day), stock will deplete in 2.7 days.',
     '[{"label":"Order 5000 kg concentrate","done":false},{"label":"Verify supplier delivery schedule","done":false}]'::jsonb,
     0.96, now() + interval '3 days', '{"stock":480,"reorder":2000,"days_remaining":2.7}'::jsonb),
    ('00000000-0000-0000-0000-000000000001', 'action_plan', 'breeding', 'high', 5,
     'Daily Action Plan — check 2 cows due for calving',
     'GF-067 expected to calve in 3 days. Prepare calving pen, ensure colostrum supply, and have vet on standby.',
     '[{"label":"Disinfect calving pen","done":false},{"label":"Confirm colostrum stock","done":false},{"label":"Brief milking crew on signs of calving","done":false}]'::jsonb,
     0.95, now() + interval '1 day', '{"calving_soon":true}'::jsonb),
    ('00000000-0000-0000-0000-000000000001', 'recommendation', 'financial', 'low', 1,
     'Expense optimization: feed costs 32% above target',
     'Feed expenses are $4,200 this month vs target $3,200. Review feed wastage, negotiate bulk pricing, and consider alternative feed sources.',
     '[{"label":"Audit feed bunk wastage","done":false},{"label":"Contact 2 alternative suppliers","done":false}]'::jsonb,
     0.78, now() + interval '14 days', '{}'::jsonb)
  ON CONFLICT DO NOTHING;
END $$;
