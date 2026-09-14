import { createContext, useContext } from "react";

/**
 * Names of the MCP servers the active session reports. pid-mcp registers each MCP tool as a Pi
 * tool named `<server>_<tool>`; knowing the server names lets a tool card read
 * "MCP acme-engine · lookup mysql catalog" instead of the raw tool name.
 */
export const McpServersContext = createContext<readonly string[]>([]);

export const useMcpServers = () => useContext(McpServersContext);
