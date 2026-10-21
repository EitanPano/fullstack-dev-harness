// route.ts belongs: the HTTP adapter, an Express Router. Per endpoint it mounts the middleware
// the endpoint needs (auth, role gate), validates the request parts it reads with validate(),
// calls one controller function and sends the status and body.
// It does not belong: business rules (service.ts), data access (repository.ts) or schemas
// (schema.ts).
//
// Reference module: README > Adding a module explains how to copy it.
import { Router } from 'express'

import { requireAuth, requireCaller } from '../../middleware/auth'
import { requireRole } from '../../middleware/role'
import { readInput, validate } from '../../middleware/validate'
import * as controller from './controller'
import { CreateModuleBody, ListModuleQuery, ModuleIdParams, UpdateModuleBody } from './schema'

export const moduleRoute = Router()

const listInput = { query: ListModuleQuery }
moduleRoute.get('/', validate(listInput), async (_req, res) => {
  const { query } = readInput(res, listInput)
  res.json(await controller.listModule({ query }))
})

const getInput = { params: ModuleIdParams }
moduleRoute.get('/:id', validate(getInput), async (_req, res) => {
  const { params } = readInput(res, getInput)
  res.json(await controller.getModule(params.id))
})

const createInput = { body: CreateModuleBody }
moduleRoute.post('/', requireAuth, validate(createInput), async (_req, res) => {
  const { body } = readInput(res, createInput)
  const created = await controller.createModule({ input: body, caller: requireCaller(res) })
  res.status(201).json(created)
})

const updateInput = { params: ModuleIdParams, body: UpdateModuleBody }
moduleRoute.patch('/:id', requireAuth, validate(updateInput), async (_req, res) => {
  const { params, body } = readInput(res, updateInput)
  const updated = await controller.updateModule({
    id: params.id,
    input: body,
    caller: requireCaller(res),
  })
  res.json(updated)
})

const deleteInput = { params: ModuleIdParams }
moduleRoute.delete('/:id', requireRole('admin'), validate(deleteInput), async (_req, res) => {
  const { params } = readInput(res, deleteInput)
  await controller.deleteModule({ id: params.id, caller: requireCaller(res) })
  res.status(204).end()
})
