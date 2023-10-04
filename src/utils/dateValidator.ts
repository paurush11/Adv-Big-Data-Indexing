export function isValidDate(dateString: string): boolean {
  const regex = /^(0[1-9]|[12][0-9]|3[01])-(0[1-9]|1[012])-([12]\d{3})$/;
  if (!regex.test(dateString)) return false;

  const [day, month, year] = dateString.split("-").map(Number);
  const date = new Date(year, month - 1, day);

  return (
    date &&
    date.getDate() === day &&
    date.getMonth() + 1 === month &&
    date.getFullYear() === year
  );
}
