#!/usr/bin/env node
import { basename } from 'node:path'
import { parseScaffoldArgs, scaffoldProject } from './scaffold.js'

const invokedAs = basename(process.argv[1] ?? 'create-nexis')
const { name, options } = parseScaffoldArgs(process.argv.slice(2))
if (!name) throw new Error(`Usage: ${invokedAs} <project-name> [--yes] [--ts|--js] [--tailwind]`)
const result = await scaffoldProject(name, process.cwd(), options)
console.log(`Created ${result.directory}`)
