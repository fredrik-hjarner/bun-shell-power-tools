#!/usr/bin/env bun

/**
 * bun_pipe - Enhanced Pipe-to-File Wrapper
 * 
 * Problem: Many commands only accept file arguments, and you want output back
 *          in pipeline.
 * Solution: Creates temp files for input/output, pipes result to stdout.
 * 
 * Interface: 
 *   echo "content" | bun_pipe 'command %in %out'  (stdin → %in)
 *   bun_pipe 'command existing_file %out'         (use existing files)
 * 
 * Placeholders:
 * - %in placeholder gets replaced with temp input file (from stdin)
 * - %out placeholder gets replaced with temp output file 
 * - After command runs, %out contents are written to stdout
 * - Temp files get cleaned up automatically
 * 
 * Examples:
 *   echo "db 'hello', 10" | bun_pipe 'fasmg %in %out'
 *   bun_pipe 'fasmg input.asm %out' | hexdump -C
 *   cat data.txt | bun_pipe 'sort %in > %out' | head -5
 */

import { $ } from "bun";

async function filePipe() {
  // Get command template from arguments first
  const commandTemplate = process.argv.slice(2).join(' ');

  if (!commandTemplate) {
    console.error("No command specified");
    console.error("Usage: echo 'content' | bun_pipe 'command %in %out'");
    console.error("   OR: bun_pipe 'command existing_file %out'");
    process.exit(1);
  }

  // Check what placeholders are used
  const hasIn = commandTemplate.includes('%in');
  const hasOut = commandTemplate.includes('%out');

  if (!hasIn && !hasOut) {
    console.error("No placeholders found. Use %in and/or %out");
    process.exit(1);
  }

  // If using %in, we need piped input
  if (hasIn && process.stdin.isTTY) {
    console.error("Error: %in requires piped input");
    console.error("Usage: echo 'content' | bun_pipe 'command %in %out'");
    process.exit(1);
  }

  // Read stdin only if %in is used
  let stdinText = '';
  if (hasIn) {
    stdinText = await new Response(Bun.stdin.stream()).text();
  }

  // Create temp files in RAM for faster processing
  const timestamp = Date.now();
  const inputFile = `/dev/shm/pipe-in-${timestamp}.tmp`;
  const outputFile = `/dev/shm/pipe-out-${timestamp}.tmp`;

  // Write stdin to input file only if %in is used
  if (hasIn) {
    await Bun.write(inputFile, stdinText);
  }

  try {
    // Replace placeholders with temp file paths
    let finalCommand = commandTemplate;
    
    if (hasIn) {
      finalCommand = finalCommand.replaceAll('%in', inputFile);
    }
    
    if (hasOut) {
      finalCommand = finalCommand.replaceAll('%out', outputFile);
    }

    // Execute the command (silence stdout - we only want the output file)
    const result = Bun.spawn(["sh", "-c", finalCommand], {
      stdout: "ignore",
    });
    
    const exitCode = await result.exited;
    
    // If command failed, exit with same code
    if (exitCode !== 0) {
      process.exit(exitCode);
    }

    // If %out was used, write output file contents to stdout
    if (hasOut) {
      const outputExists = await Bun.file(outputFile).exists();
      if (outputExists) {
        const outputContent = await Bun.file(outputFile).arrayBuffer();
        await Bun.write(Bun.stdout, new Uint8Array(outputContent));
      }
    }

  } finally {
    // Always cleanup temp files
    await $`rm -f ${inputFile} ${outputFile}`.nothrow();
  }
}

filePipe();