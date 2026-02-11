-- Seed Rooms
DELETE FROM rooms;
INSERT INTO rooms (name, building, floor, capacity, has_ac, has_projector) VALUES
('Room 101', 'Main Building', 1, 60, TRUE, TRUE),
('Room 102', 'Main Building', 1, 40, TRUE, FALSE),
('Room 103', 'Main Building', 1, 40, FALSE, TRUE),
('Room 104', 'Main Building', 1, 30, FALSE, FALSE),
('Room 201', 'Science Block', 2, 100, TRUE, TRUE),
('Room 202', 'Science Block', 2, 80, TRUE, TRUE),
('Room 301', 'IT Block', 3, 50, TRUE, TRUE);
