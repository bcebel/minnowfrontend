/**
 * Minnow Space - Bold Black, Red, Green Theme
 */

const tintColorLight = "#FF0000"; // Pure red
const tintColorDark = "#00ffff"; // Pure green

export const Colors = {
  light: {
    text: "#000000", // Pure black
    background: "#FFFFFF", // White background for contrast
    tint: tintColorLight, // Pure red
    icon: "#000000", // Black icons
    tabIconDefault: "#333333", // Dark gray for unselected
    tabIconSelected: "#FF0000", // Bright red for selected
  },
  dark: {
    text: "#00ffff", // Pure green text
    background: "#000000", // Pure black background
    tint: tintColorDark, // Pure green
    icon: "#00ffff", // Green icons
    tabIconDefault: "#00AA00", // Darker green for unselected
    tabIconSelected: "#00ffff", // Bright green for selected
  },
};
