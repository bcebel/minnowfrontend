export const themes = {
  earth: {
    light: {
      background: "#FCFAF8",
      foreground: "#EDEAE6",
      typography: "#1B140C",
      tint: "#9A734C",
      link: "#1E3799",
      accents: {
        banana: "#F6E58D",
        pumpkin: "#FFBE76",
        apple: "#FF7979",
        grass: "#BADC58",
        storm: "#686DE0",
      },
    },
    dark: {
      background: "#221A11",
      foreground: "#332618",
      typography: "#FFFFFF",
      tint: "#C9AD92",
      link: "#0C2461",
      accents: {
        banana: "#f9CA24",
        pumpkin: "#F0932B",
        apple: "#EB4D4B",
        grass: "#6AB04C",
        storm: "#4834D4",
      },
    },
  },
  ocean: {
    light: {
      background: "#F0F8FF",
      foreground: "#E1F5FE",
      typography: "#01579B",
      tint: "#0288D1",
      link: "#0277BD",
      accents: {
        banana: "#FFF9C4",
        pumpkin: "#FFD54F",
        apple: "#EF5350",
        grass: "#66BB6A",
        storm: "#5C6BC0",
      },
    },
    dark: {
      background: "#001F3F",
      foreground: "#003366",
      typography: "#E1F5FE",
      tint: "#4FC3F7",
      link: "#29B6F6",
      accents: {
        banana: "#FFEB3B",
        pumpkin: "#FFA000",
        apple: "#F44336",
        grass: "#4CAF50",
        storm: "#3F51B5",
      },
    },
  },
  forest: {
    light: {
      background: "#F1F8E9",
      foreground: "#E8F5E8",
      typography: "#1B5E20",
      tint: "#388E3C",
      link: "#2E7D32",
      accents: {
        banana: "#F0F4C3",
        pumpkin: "#FFD54F",
        apple: "#EF5350",
        grass: "#81C784",
        storm: "#7986CB",
      },
    },
    dark: {
      background: "#1A237E",
      foreground: "#283593",
      typography: "#E8F5E9",
      tint: "#4CAF50",
      link: "#66BB6A",
      accents: {
        banana: "#CDDC39",
        pumpkin: "#FFA000",
        apple: "#F44336",
        grass: "#4CAF50",
        storm: "#5C6BC0",
      },
    },
  },
};

// FIXED: Make sure this returns the theme object, not a number
export const useTheme = (scheme: keyof typeof themes = "earth") => {
  // Return the light theme of the selected scheme
  return themes[scheme].light; // ← This should return an object, not a number
};

// Alternative if you want dark mode:
export const useThemeWithMode = (
  scheme: keyof typeof themes = "earth",
  mode: "light" | "dark" = "light"
) => {
  return themes[scheme][mode];
};
