export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        "on-primary": "#003547",
        "surface-container-high": "#2a2a2a",
        "on-primary-fixed": "#001e2b",
        "surface-variant": "#353534",
        "surface-container-lowest": "#0e0e0e",
        "surface-bright": "#3a3939",
        secondary: "#89ceff",
        "on-error": "#690005",
        "surface-tint": "#7bd1fa",
        "on-primary-fixed-variant": "#004d66",
        "on-tertiary-fixed": "#2a1800",
        "primary-fixed": "#c0e8ff",
        error: "#ffb4ab",
        "inverse-surface": "#e5e2e1",
        "primary-container": "#7dd3fc",
        "primary-fixed-dim": "#7bd1fa",
        "on-tertiary-container": "#754b00",
        "error-container": "#93000a",
        "secondary-fixed-dim": "#89ceff",
        "outline-variant": "#3f484e",
        "on-secondary-container": "#00344e",
        "on-tertiary-fixed-variant": "#633f00",
        "on-error-container": "#ffdad6",
        "on-surface": "#e5e2e1",
        "surface-container-low": "#1c1b1b",
        "on-background": "#e5e2e1",
        "on-secondary": "#00344d",
        "inverse-primary": "#006686",
        "on-primary-container": "#005b78",
        "on-surface-variant": "#bec8ce",
        "secondary-fixed": "#c9e6ff",
        primary: "#c5eaff",
        "secondary-container": "#00a2e6",
        "tertiary-fixed": "#ffddb5",
        surface: "#131313",
        "tertiary-fixed-dim": "#fcba5e",
        outline: "#899298",
        "tertiary-container": "#febc60",
        background: "#131313",
        tertiary: "#ffdfba",
        "surface-dim": "#131313",
        "on-tertiary": "#452b00",
        "on-secondary-fixed-variant": "#004c6e",
        "surface-container": "#201f1f",
        "on-secondary-fixed": "#001e2f",
        "surface-container-highest": "#353534",
        "inverse-on-surface": "#313030"
      },
      borderRadius: {
        DEFAULT: "0.25rem",
        lg: "0.5rem",
        xl: "0.75rem",
        full: "9999px"
      },
      spacing: {
        gutter: "24px",
        "player-max-width": "480px",
        unit: "4px",
        "margin-desktop": "48px",
        "margin-mobile": "16px"
      },
      fontFamily: {
        "label-caps": ["JetBrains Mono"],
        "headline-lg": ["Inter"],
        "display-lg": ["Inter"],
        "title-md": ["Inter"],
        "body-sm": ["Inter"],
        "body-lg": ["Inter"],
        "headline-lg-mobile": ["Inter"]
      },
      fontSize: {
        "label-caps": ["12px", { lineHeight: "1", letterSpacing: "0.05em", fontWeight: "500" }],
        "headline-lg": ["32px", { lineHeight: "1.2", letterSpacing: "-0.01em", fontWeight: "600" }],
        "display-lg": ["48px", { lineHeight: "1.1", letterSpacing: "-0.02em", fontWeight: "700" }],
        "title-md": ["20px", { lineHeight: "1.4", fontWeight: "500" }],
        "body-sm": ["14px", { lineHeight: "1.5", fontWeight: "400" }],
        "body-lg": ["16px", { lineHeight: "1.6", fontWeight: "400" }],
        "headline-lg-mobile": ["24px", { lineHeight: "1.2", fontWeight: "600" }]
      }
    }
  }
};
