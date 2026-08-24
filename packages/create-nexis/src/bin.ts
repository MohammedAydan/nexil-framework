#!/usr/bin/env node
import { parseScaffoldArgs, scaffoldProject } from './scaffold.js'

const { name, options } = parseScaffoldArgs(process.argv.slice(2))
if (!name) throw new Error('Usage: create-nexis <project-name> [--yes] [--ts|--js] [--tailwind]')
const result = await scaffoldProject(name, process.cwd(), options)
console.log(`Created ${result.directory}`)
