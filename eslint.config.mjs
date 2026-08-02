import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    ignores: [".next/**", "node_modules/**"],
  },
  {
    rules: {
      // The Keuangan/Kerjaan/Pelajaran tabs all fetch on mount via
      // `useEffect(() => { load() }, [])` — a long-standing, working pattern
      // predating this rule (added in eslint-plugin-react-hooks v7). Worth
      // revisiting (e.g. moving fetches server-side), but that's a broader
      // refactor than a lint-setup commit should carry, so keep it visible
      // as a warning instead of failing CI on existing, functioning code.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
];

export default eslintConfig;
