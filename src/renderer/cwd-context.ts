import { createContext, useContext } from "react";

/**
 * Working directory of the session being shown. Relative links in assistant markdown
 * ("docs/report.html") mean a file under this folder, the same way they would for pi itself.
 */
export const CwdContext = createContext<string | undefined>(undefined);

export const useCwd = () => useContext(CwdContext);
