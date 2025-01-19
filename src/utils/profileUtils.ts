// Array of background colors for profile pictures
const PROFILE_COLORS = [
  '#FF6B6B', // Red
  '#4ECDC4', // Teal
  '#45B7D1', // Blue
  '#96CEB4', // Green
  '#FFEEAD', // Yellow
  '#D4A5A5', // Pink
  '#9B59B6'  // Purple
];

export const getInitials = (fullName: string): string => {
  return fullName
    .split(' ')
    .map(name => name[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
};

export const getProfileColor = (email: string): string => {
  // Use email as a consistent way to assign colors
  const index = email.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return PROFILE_COLORS[index % PROFILE_COLORS.length];
};

export const formatFullName = (firstName: string, lastName: string): string => {
  return `${firstName} ${lastName}`.trim();
}; 