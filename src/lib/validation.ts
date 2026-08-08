const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

const REG_NO_PATTERN = /^\d+$/;
const PHONE_PATTERN = /^[0-9+()\- .]+$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isValidEmail(email: string) {
  return EMAIL_PATTERN.test(email);
}

export function validateTrainee(input: {
  registrationNumber: string;
  fullName: string;
  gender: string;
  phone: string;
  email: string;
}) {
  if (!input.registrationNumber) return "Registration number is required.";
  if (input.registrationNumber.length < 3 || input.registrationNumber.length > 30)
    return "Registration number must be 3–30 characters.";
  if (!REG_NO_PATTERN.test(input.registrationNumber))
    return "Registration number may only contain numbers.";
  if (!input.fullName || input.fullName.length < 3)
    return "Full name is required (at least 3 characters).";
  if (!["Male", "Female"].includes(input.gender)) return "Please choose a valid gender.";
  if (!input.phone || input.phone.length < 7 || input.phone.length > 20 || !PHONE_PATTERN.test(input.phone))
    return "Please enter a valid phone number.";
  if (input.email && !isValidEmail(input.email)) return "Please enter a valid email address.";
  return null;
}

export function validatePassword(password: string) {
  if (password.length < 8) return "Password must be at least 8 characters.";
  if (password.length > 128) return "Password is too long (max 128 characters).";
  return null;
}

export function validateSignup(input: {
  registrationNumber: string;
  fullName: string;
  email: string;
  phone: string;
  gender: string;
  password: string;
}) {
  if (!input.registrationNumber) return "Registration number is required.";
  if (input.registrationNumber.length < 3 || input.registrationNumber.length > 30)
    return "Registration number must be 3–30 characters.";
  if (!REG_NO_PATTERN.test(input.registrationNumber))
    return "Registration number may only contain numbers.";
  if (!input.fullName || input.fullName.length < 3)
    return "Full name is required (at least 3 characters).";
  if (!isValidEmail(input.email)) return "Please enter a valid email address.";
  if (!["Male", "Female"].includes(input.gender)) return "Please choose a valid gender.";
  if (
    !input.phone ||
    input.phone.length < 7 ||
    input.phone.length > 20 ||
    !PHONE_PATTERN.test(input.phone)
  )
    return "Please enter a valid phone number.";
  return validatePassword(input.password);
}

export function validateScore(value: number) {
  if (Number.isNaN(value) || value < 0 || value > 100) return "Scores must be between 0 and 100.";
  return null;
}

export function validateSchedule(input: {
  title: string;
  programme: string;
  date: string;
  startTime: string;
  endTime: string;
}) {
  if (!input.title || input.title.length < 3) return "Title is required (at least 3 characters).";
  if (!input.programme) return "Programme is required.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return "Please choose a valid date.";
  if (!TIME_PATTERN.test(input.startTime)) return "Please choose a valid start time.";
  if (!TIME_PATTERN.test(input.endTime)) return "Please choose a valid end time.";
  if (input.startTime >= input.endTime) return "End time must be after start time.";
  return null;
}
