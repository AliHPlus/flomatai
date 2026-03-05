/**
 * MCP Demo — Filesystem Agent
 *
 * A ReAct agent that uses the MCP filesystem server to explore and
 * read files, answering questions about directory contents.
 *
 * The agent's skills are created automatically from the MCP server's
 * tool list via createMCPSkillsFromServer() — no manual skill wiring needed.
 *
 * Skills provided by @modelcontextprotocol/server-filesystem:
 *   read_file          — Read the complete contents of a file
 *   read_multiple_files — Read multiple files at once
 *   write_file         — Create or overwrite a file
 *   edit_file          — Make line-based edits to a file
 *   create_directory   — Create a new directory
 *   list_directory     — List files and directories
 *   directory_tree     — Get a recursive tree view
 *   move_file          — Move or rename a file/directory
 *   search_files       — Search for files matching a pattern
 *   get_file_info      — Get metadata about a file or directory
 *   list_allowed_directories — List the directories this server can access
 */

import { createAgent } from '@flomatai/core';
import type { Skill } from '@flomatai/core';

export function createFilesystemAgent(skills: Skill[], maxIterations = 10) {
  return createAgent({
    name: 'filesystem-agent',

    role: `You are a filesystem assistant. You help users explore, read, and understand
files and directories on the local filesystem.

Your capabilities (via MCP filesystem server tools):
- List directory contents with list_directory or directory_tree
- Read file contents with read_file or read_multiple_files
- Search for files matching patterns with search_files
- Get file metadata with get_file_info
- Write or edit files when explicitly asked

Guidelines:
- Always start by listing the directory to understand the structure
- Use directory_tree for a complete overview
- Read relevant files to answer questions thoroughly
- For write operations, confirm the path and content before proceeding
- When done, provide a clear summary of what you found`,

    skills,

    strategy: 'react',

    reactOptions: {
      maxIterations,
      reflectionInterval: 5,
      systemPromptSuffix: `
Filesystem guidelines:
- list_directory or directory_tree first, then read specific files
- Use search_files when looking for something specific
- read_multiple_files is more efficient than multiple read_file calls
- Always quote exact file paths from the directory listing`,
    },
  });
}
