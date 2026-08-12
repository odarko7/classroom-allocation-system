export const FACILITIES = [
  { name: 'Projector', description: 'Ceiling or wall-mounted digital projector' },
  { name: 'Smart Board', description: 'Interactive smart whiteboard' },
  { name: 'Computers', description: 'Desktop computers for students' },
  { name: 'Internet', description: 'High-speed internet access' },
  { name: 'Audio System', description: 'Speakers and microphone system' },
  { name: 'Air Conditioning', description: 'Air-conditioned room' },
  { name: 'Power Backup', description: 'Uninterruptible power supply' },
  { name: 'Recording Equipment', description: 'Lecture recording equipment' },
  { name: 'Laboratory Equipment', description: 'Scientific laboratory apparatus' },
  { name: 'Whiteboard', description: 'Standard whiteboard' },
];

export const FACULTIES = [
  { name: 'Faculty of Computing and Informatics', code: 'FCI', description: 'Computer Science, Software Engineering and IT' },
  { name: 'Faculty of Engineering', code: 'FE', description: 'Electrical, Mechanical and Civil Engineering' },
  { name: 'Faculty of Business and Management', code: 'FBM', description: 'Business, Accounting and Finance' },
  { name: 'Faculty of Health Sciences', code: 'FHS', description: 'Nursing and Laboratory Sciences' },
  { name: 'Faculty of Education', code: 'FED', description: 'Education and Humanities' },
];

export const DEPARTMENTS = [
  { name: 'Computer Science', code: 'CS', facultyCode: 'FCI', preferredBuilding: 'C' },
  { name: 'Software Engineering', code: 'SE', facultyCode: 'FCI', preferredBuilding: 'C' },
  { name: 'Information Technology', code: 'IT', facultyCode: 'FCI', preferredBuilding: 'C' },
  { name: 'Electrical Engineering', code: 'EE', facultyCode: 'FE', preferredBuilding: 'B' },
  { name: 'Mechanical Engineering', code: 'ME', facultyCode: 'FE', preferredBuilding: 'B' },
  { name: 'Business Administration', code: 'BA', facultyCode: 'FBM', preferredBuilding: 'A' },
  { name: 'Accounting and Finance', code: 'AF', facultyCode: 'FBM', preferredBuilding: 'A' },
  { name: 'Nursing', code: 'NU', facultyCode: 'FHS', preferredBuilding: 'D' },
  { name: 'Medical Laboratory Science', code: 'MLS', facultyCode: 'FHS', preferredBuilding: 'D' },
  { name: 'Education', code: 'ED', facultyCode: 'FED', preferredBuilding: 'F' },
];

const lect = (staffNo: string, name: string, deptCode: string, title: string) => ({ staffNo, name, deptCode, title });

export const LECTURERS = [
  lect('STAFF-003', 'Dr. Sarah Okafor', 'SE', 'Senior Lecturer'),
  lect('STAFF-005', 'Dr. Grace Ndlovu', 'IT', 'Senior Lecturer'),
  lect('STAFF-011', 'Dr. Cynthia Wanjiku', 'BA', 'Senior Lecturer'),
  lect('STAFF-013', 'Dr. Elizabeth Mensah', 'AF', 'Senior Lecturer'),
  lect('STAFF-026', 'Mr. Victor Mwangi', 'ME', 'Lecturer'),
];

// classroom: roomCode, building, floor, capacity, roomType, accessibility, facilities[]
export const CLASSROOMS = [
  { roomCode: 'LT-101', building: 'A', floor: 1, capacity: 120, roomType: 'Lecture Hall', accessibility: 'Wheelchair', facilities: ['Projector', 'Internet', 'Air Conditioning', 'Audio System', 'Whiteboard'] },
  { roomCode: 'LT-102', building: 'A', floor: 1, capacity: 80, roomType: 'Lecture Hall', accessibility: 'Wheelchair', facilities: ['Projector', 'Internet', 'Air Conditioning', 'Audio System', 'Whiteboard'] },
  { roomCode: 'LT-201', building: 'B', floor: 1, capacity: 150, roomType: 'Lecture Hall', accessibility: 'Wheelchair', facilities: ['Projector', 'Internet', 'Audio System', 'Air Conditioning', 'Whiteboard'] },
  { roomCode: 'LT-202', building: 'B', floor: 1, capacity: 100, roomType: 'Lecture Hall', accessibility: 'Wheelchair', facilities: ['Projector', 'Internet', 'Audio System', 'Whiteboard'] },
  { roomCode: 'LT-204', building: 'B', floor: 2, capacity: 90, roomType: 'Lecture Hall', accessibility: 'Wheelchair', facilities: ['Projector', 'Internet', 'Audio System', 'Air Conditioning', 'Smart Board'] },
];

// course: code, name, deptCode, studentCount, creditHours, requiredRoomType, facilities[], lecturerIdx
export const COURSES = [
  { code: 'SE101', name: 'Software Engineering Fundamentals', dept: 'SE', students: 85, credits: 3, roomType: 'Lecture Hall', facilities: ['Projector', 'Internet'], lecturer: 'Dr. Sarah Okafor' },
  { code: 'IT101', name: 'Introduction to Information Technology', dept: 'IT', students: 130, credits: 3, roomType: 'Lecture Hall', facilities: ['Projector', 'Internet'], lecturer: 'Dr. Grace Ndlovu' },
  { code: 'ME201', name: 'Thermodynamics', dept: 'ME', students: 80, credits: 4, roomType: 'Lecture Hall', facilities: ['Projector', 'Air Conditioning'], lecturer: 'Mr. Victor Mwangi' },
  { code: 'BA101', name: 'Principles of Management', dept: 'BA', students: 140, credits: 3, roomType: 'Lecture Hall', facilities: ['Projector', 'Audio System'], lecturer: 'Dr. Cynthia Wanjiku' },
  { code: 'AF101', name: 'Financial Accounting', dept: 'AF', students: 120, credits: 4, roomType: 'Lecture Hall', facilities: ['Projector'], lecturer: 'Dr. Elizabeth Mensah' },
];

export const TIME_SLOTS = [
  { day: 0, start: '08:00', end: '09:30', period: 'Morning 1' },
  { day: 0, start: '09:45', end: '11:15', period: 'Morning 2' },
  { day: 0, start: '11:30', end: '13:00', period: 'Midday' },
  { day: 0, start: '14:00', end: '15:30', period: 'Afternoon 1' },
  { day: 0, start: '15:45', end: '17:15', period: 'Afternoon 2' },
  { day: 1, start: '08:00', end: '09:30', period: 'Morning 1' },
  { day: 1, start: '09:45', end: '11:15', period: 'Morning 2' },
  { day: 1, start: '11:30', end: '13:00', period: 'Midday' },
  { day: 1, start: '14:00', end: '15:30', period: 'Afternoon 1' },
  { day: 1, start: '15:45', end: '17:15', period: 'Afternoon 2' },
  { day: 2, start: '08:00', end: '09:30', period: 'Morning 1' },
  { day: 2, start: '09:45', end: '11:15', period: 'Morning 2' },
  { day: 2, start: '11:30', end: '13:00', period: 'Midday' },
  { day: 2, start: '14:00', end: '15:30', period: 'Afternoon 1' },
  { day: 2, start: '15:45', end: '17:15', period: 'Afternoon 2' },
  { day: 3, start: '08:00', end: '09:30', period: 'Morning 1' },
  { day: 3, start: '09:45', end: '11:15', period: 'Morning 2' },
  { day: 3, start: '11:30', end: '13:00', period: 'Midday' },
  { day: 3, start: '14:00', end: '15:30', period: 'Afternoon 1' },
  { day: 3, start: '15:45', end: '17:15', period: 'Afternoon 2' },
  { day: 4, start: '08:00', end: '09:30', period: 'Morning 1' },
  { day: 4, start: '09:45', end: '11:15', period: 'Morning 2' },
  { day: 4, start: '11:30', end: '13:00', period: 'Midday' },
  { day: 4, start: '14:00', end: '15:30', period: 'Afternoon 1' },
  { day: 4, start: '15:45', end: '17:15', period: 'Afternoon 2' },
];

export const SEMESTERS = [
  { name: 'Semester 1 2025/2026', startDate: '2025-09-01', endDate: '2026-01-30', status: 'COMPLETED' },
  { name: 'Semester 2 2025/2026', startDate: '2026-02-02', endDate: '2026-06-30', status: 'ACTIVE' },
];

export const DEMO_USERS = [
  { name: 'System Administrator', email: 'admin@example.com', password: 'Admin@123', role: 'SUPER_ADMIN', department: null },
];
