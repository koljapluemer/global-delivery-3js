export class EventQueue<T> {
  private readonly handlers: Array<(event: T) => void> = []

  push(event: T): void {
    for (const handler of this.handlers) handler(event)
  }

  subscribe(handler: (event: T) => void): () => void {
    this.handlers.push(handler)
    return () => {
      const i = this.handlers.indexOf(handler)
      if (i >= 0) this.handlers.splice(i, 1)
    }
  }
}
