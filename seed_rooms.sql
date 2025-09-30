-- Insert rooms
INSERT INTO rooms (room_id, features) VALUES
  ('Room 101', ARRAY['AC', 'Projector']),
  ('Room 102', ARRAY['AC']),
  ('Room 103', ARRAY['Projector']),
  ('Room 104', ARRAY[]::TEXT[]),
  ('Room 105', ARRAY['AC']),
  ('Room 106', ARRAY['Projector']),
  ('Room 107', ARRAY['AC', 'Projector']),
  ('Room 108', ARRAY[]::TEXT[]),
  ('Room 109', ARRAY['AC']),
  ('Room 110', ARRAY['Projector']),
  ('Room 111', ARRAY['AC', 'Projector']),
  ('Room 112', ARRAY[]::TEXT[]),
  ('Room 113', ARRAY['AC']),
  ('Room 114', ARRAY['Projector']),
  ('Room 115', ARRAY['AC', 'Projector']),
  ('Room 116', ARRAY[]::TEXT[])
ON CONFLICT DO NOTHING;

-- Insert days
INSERT INTO days (day) VALUES
  ('Mon'), ('Tue'), ('Wed'), ('Thu'), ('Fri')
ON CONFLICT DO NOTHING;

-- Insert slots
INSERT INTO slots (slot) VALUES
  ('08:00-09:00'),
  ('09:00-10:00'),
  ('10:00-11:00'),
  ('11:00-12:00'),
  ('12:00-13:00'),
  ('13:00-14:00'),
  ('14:00-15:00'),
  ('15:00-16:00'),
  ('16:00-17:00'),
  ('17:00-18:00')
ON CONFLICT DO NOTHING;

-- Insert availability
-- Mon
INSERT INTO availability (day, slot, room_id) VALUES
  ('Mon', '09:00-10:00', 'Room 102'),
  ('Mon', '09:00-10:00', 'Room 104'),
  ('Mon', '09:00-10:00', 'Room 109'),
  ('Mon', '10:00-11:00', 'Room 101'),
  ('Mon', '10:00-11:00', 'Room 104'),
  ('Mon', '10:00-11:00', 'Room 113'),
  ('Mon', '10:00-11:00', 'Room 114'),
  ('Mon', '11:00-12:00', 'Room 103'),
  ('Mon', '11:00-12:00', 'Room 105'),
  ('Mon', '12:00-13:00', 'Room 102'),
  ('Mon', '12:00-13:00', 'Room 104'),
  ('Mon', '12:00-13:00', 'Room 110'),
  ('Mon', '12:00-13:00', 'Room 111'),
  ('Mon', '13:00-14:00', 'Room 101'),
  ('Mon', '14:00-15:00', 'Room 102'),
  ('Mon', '14:00-15:00', 'Room 103'),
  ('Mon', '14:00-15:00', 'Room 106'),
  ('Mon', '15:00-16:00', 'Room 104'),
  ('Mon', '15:00-16:00', 'Room 105'),
  ('Mon', '15:00-16:00', 'Room 110'),
  ('Mon', '16:00-17:00', 'Room 101'),
  ('Mon', '16:00-17:00', 'Room 102'),
  ('Mon', '16:00-17:00', 'Room 114'),
  ('Mon', '16:00-17:00', 'Room 115'),
  ('Mon', '17:00-18:00', 'Room 103'),
  ('Mon', '17:00-18:00', 'Room 104'),
  ('Mon', '17:00-18:00', 'Room 107')
ON CONFLICT DO NOTHING;

-- Tue
INSERT INTO availability (day, slot, room_id) VALUES
  ('Tue', '08:00-09:00', 'Room 102'),
  ('Tue', '08:00-09:00', 'Room 104'),
  ('Tue', '09:00-10:00', 'Room 101'),
  ('Tue', '09:00-10:00', 'Room 104'),
  ('Tue', '09:00-10:00', 'Room 109'),
  ('Tue', '09:00-10:00', 'Room 110'),
  ('Tue', '10:00-11:00', 'Room 103'),
  ('Tue', '10:00-11:00', 'Room 105'),
  ('Tue', '10:00-11:00', 'Room 113'),
  ('Tue', '11:00-12:00', 'Room 101'),
  ('Tue', '11:00-12:00', 'Room 102'),
  ('Tue', '11:00-12:00', 'Room 106'),
  ('Tue', '12:00-13:00', 'Room 102'),
  ('Tue', '12:00-13:00', 'Room 104'),
  ('Tue', '12:00-13:00', 'Room 110'),
  ('Tue', '12:00-13:00', 'Room 111'),
  ('Tue', '12:00-13:00', 'Room 112'),
  ('Tue', '13:00-14:00', 'Room 104'),
  ('Tue', '13:00-14:00', 'Room 105'),
  ('Tue', '14:00-15:00', 'Room 103'),
  ('Tue', '14:00-15:00', 'Room 104'),
  ('Tue', '14:00-15:00', 'Room 106'),
  ('Tue', '14:00-15:00', 'Room 107'),
  ('Tue', '15:00-16:00', 'Room 101'),
  ('Tue', '15:00-16:00', 'Room 102'),
  ('Tue', '15:00-16:00', 'Room 110'),
  ('Tue', '16:00-17:00', 'Room 102'),
  ('Tue', '16:00-17:00', 'Room 103'),
  ('Tue', '16:00-17:00', 'Room 114'),
  ('Tue', '16:00-17:00', 'Room 115'),
  ('Tue', '17:00-18:00', 'Room 103'),
  ('Tue', '17:00-18:00', 'Room 104')
ON CONFLICT DO NOTHING;

-- Wed
INSERT INTO availability (day, slot, room_id) VALUES
  ('Wed', '08:00-09:00', 'Room 103'),
  ('Wed', '08:00-09:00', 'Room 104'),
  ('Wed', '08:00-09:00', 'Room 105'),
  ('Wed', '09:00-10:00', 'Room 101'),
  ('Wed', '09:00-10:00', 'Room 104'),
  ('Wed', '09:00-10:00', 'Room 109'),
  ('Wed', '09:00-10:00', 'Room 110'),
  ('Wed', '10:00-11:00', 'Room 102'),
  ('Wed', '10:00-11:00', 'Room 104'),
  ('Wed', '10:00-11:00', 'Room 113'),
  ('Wed', '10:00-11:00', 'Room 114'),
  ('Wed', '11:00-12:00', 'Room 101'),
  ('Wed', '11:00-12:00', 'Room 103'),
  ('Wed', '12:00-13:00', 'Room 102'),
  ('Wed', '12:00-13:00', 'Room 104'),
  ('Wed', '12:00-13:00', 'Room 110'),
  ('Wed', '12:00-13:00', 'Room 111'),
  ('Wed', '13:00-14:00', 'Room 102'),
  ('Wed', '13:00-14:00', 'Room 104'),
  ('Wed', '14:00-15:00', 'Room 101'),
  ('Wed', '14:00-15:00', 'Room 103'),
  ('Wed', '14:00-15:00', 'Room 106'),
  ('Wed', '15:00-16:00', 'Room 104'),
  ('Wed', '15:00-16:00', 'Room 105'),
  ('Wed', '15:00-16:00', 'Room 110'),
  ('Wed', '16:00-17:00', 'Room 101'),
  ('Wed', '16:00-17:00', 'Room 102'),
  ('Wed', '16:00-17:00', 'Room 114'),
  ('Wed', '17:00-18:00', 'Room 103'),
  ('Wed', '17:00-18:00', 'Room 104'),
  ('Wed', '17:00-18:00', 'Room 107')
ON CONFLICT DO NOTHING;

-- Thu
INSERT INTO availability (day, slot, room_id) VALUES
  ('Thu', '08:00-09:00', 'Room 101'),
  ('Thu', '08:00-09:00', 'Room 104'),
  ('Thu', '09:00-10:00', 'Room 102'),
  ('Thu', '09:00-10:00', 'Room 103'),
  ('Thu', '09:00-10:00', 'Room 109'),
  ('Thu', '10:00-11:00', 'Room 101'),
  ('Thu', '10:00-11:00', 'Room 104'),
  ('Thu', '10:00-11:00', 'Room 113'),
  ('Thu', '11:00-12:00', 'Room 104'),
  ('Thu', '11:00-12:00', 'Room 105'),
  ('Thu', '12:00-13:00', 'Room 103'),
  ('Thu', '12:00-13:00', 'Room 102'),
  ('Thu', '12:00-13:00', 'Room 110'),
  ('Thu', '12:00-13:00', 'Room 111'),
  ('Thu', '13:00-14:00', 'Room 101'),
  ('Thu', '14:00-15:00', 'Room 101'),
  ('Thu', '14:00-15:00', 'Room 104'),
  ('Thu', '14:00-15:00', 'Room 106'),
  ('Thu', '15:00-16:00', 'Room 102'),
  ('Thu', '15:00-16:00', 'Room 103'),
  ('Thu', '15:00-16:00', 'Room 110'),
  ('Thu', '16:00-17:00', 'Room 101'),
  ('Thu', '16:00-17:00', 'Room 102'),
  ('Thu', '16:00-17:00', 'Room 114'),
  ('Thu', '17:00-18:00', 'Room 104'),
  ('Thu', '17:00-18:00', 'Room 105'),
  ('Thu', '17:00-18:00', 'Room 107')
ON CONFLICT DO NOTHING;

-- Fri
INSERT INTO availability (day, slot, room_id) VALUES
  ('Fri', '08:00-09:00', 'Room 102'),
  ('Fri', '08:00-09:00', 'Room 103'),
  ('Fri', '09:00-10:00', 'Room 104'),
  ('Fri', '09:00-10:00', 'Room 101'),
  ('Fri', '09:00-10:00', 'Room 109'),
  ('Fri', '10:00-11:00', 'Room 101'),
  ('Fri', '10:00-11:00', 'Room 102'),
  ('Fri', '10:00-11:00', 'Room 113'),
  ('Fri', '11:00-12:00', 'Room 103'),
  ('Fri', '11:00-12:00', 'Room 104'),
  ('Fri', '12:00-13:00', 'Room 101'),
  ('Fri', '12:00-13:00', 'Room 102'),
  ('Fri', '12:00-13:00', 'Room 110'),
  ('Fri', '12:00-13:00', 'Room 111'),
  ('Fri', '13:00-14:00', 'Room 102'),
  ('Fri', '13:00-14:00', 'Room 103'),
  ('Fri', '14:00-15:00', 'Room 102'),
  ('Fri', '14:00-15:00', 'Room 103'),
  ('Fri', '14:00-15:00', 'Room 106'),
  ('Fri', '15:00-16:00', 'Room 101'),
  ('Fri', '15:00-16:00', 'Room 104'),
  ('Fri', '15:00-16:00', 'Room 110'),
  ('Fri', '16:00-17:00', 'Room 102'),
  ('Fri', '16:00-17:00', 'Room 103'),
  ('Fri', '16:00-17:00', 'Room 114'),
  ('Fri', '17:00-18:00', 'Room 103'),
  ('Fri', '17:00-18:00', 'Room 104'),
  ('Fri', '17:00-18:00', 'Room 107')
ON CONFLICT DO NOTHING;
