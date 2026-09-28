-- Run after schema.sql. Fictional stations spread across a fake service area
-- for testing the nearest-station dispatch logic.

insert into stations (name, category, latitude, longitude, handles_types, status, contact_info) values
  ('Fire Station 1',    'fire',    13.0100, 80.2000, array['fire', 'accident'],           'available', '100'),
  ('Fire Station 4',    'fire',    13.0480, 80.2080, array['fire', 'accident'],           'available', '100'),
  ('General Hospital',  'medical', 13.0300, 80.2150, array['medical', 'accident'],        'available', '108'),
  ('Community Clinic',  'medical', 13.0600, 80.1950, array['medical'],                    'available', '108'),
  ('Police Station 2',  'police',  13.0200, 80.2050, array['police', 'accident'],         'available', '100'),
  ('Police Station 7',  'police',  13.0550, 80.2200, array['police'],                     'busy',      '100');
