import { createStart, createMiddleware } from '@tanstack/react-start'

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next()
  } catch (error) {
    if (error != null && typeof error === 'object' && 'statusCode' in error) {
      throw error
    }
    console.error(error)
    return new Response(
      '<!DOCTYPE html><html><head><title>Error</title></head><body><h1>Server Error</h1></body></html>',
      {
        status: 500,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      },
    )
  }
})

export const startInstance = createStart(() => ({
  requestMiddleware: [errorMiddleware],
}))
