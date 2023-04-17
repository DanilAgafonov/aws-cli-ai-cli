#!/usr/bin/env node

import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import clui from "clui";
import inquirer from "inquirer";
import chalk from "chalk";
import { exec } from "node:child_process";

yargs(hideBin(process.argv))
  .usage(
    "$0 <prompt>",
    "Generate an AWS CLI command",
    (yargs) => {
      return yargs.positional("prompt", {
        describe: "Description of the command",
      });
    },
    async (args) => {
      const prompt = args.prompt;

      const loading = new clui.Spinner("Waiting for API response...");

      loading.start();

      const response = await fetch(
        "https://aws-cli-ai.vercel.app/api/generate",
        {
          method: "POST",
          body: JSON.stringify({ prompt }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to generate command");
      }

      const data = response.body;
      if (!data) {
        throw new Error("Failed to generate command");
      }

      const reader = data.getReader();
      const decoder = new TextDecoder();
      let done = false;

      let output = "";

      while (!done) {
        const { value, done: doneReading } = await reader.read();
        done = doneReading;
        const chunkValue = decoder.decode(value);
        output = output + chunkValue;
      }

      const placeholders = new Set(output.match(/<([^>]+)>/g));

      loading.stop();

      console.log(`${chalk.blue("Generated command:")} ${output}`);

      if (placeholders.size > 0) {
        const placeholderValues = await inquirer.prompt(
          [...placeholders].map((placeholder) => ({
            type: "input",
            name: placeholder,
            message: placeholder,
          }))
        );

        Object.entries(placeholderValues).forEach(([placeholder, value]) => {
          output = output.replaceAll(placeholder, value);
        });

        console.log(`${chalk.blue("Final command:")} ${output}`);
      }

      const { confirmed } = await inquirer.prompt([
        {
          type: "confirm",
          name: "confirmed",
          message: "Run command?",
          default: false,
        },
      ]);

      if (!confirmed) {
        process.exit(0);
      }

      const awsCliProcess = exec(output);

      awsCliProcess.stdout.on("data", (data) => {
        process.stdout.write(data);
      });

      // Handle stderr (standard error)
      awsCliProcess.stderr.on("data", (data) => {
        process.stderr.write(data);
      });

      awsCliProcess.on("exit", (code) => {
        process.exit(code);
      });
    }
  )
  .parse();
