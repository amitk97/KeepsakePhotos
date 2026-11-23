// Shared error types so the route can give guests the right message, whatever the provider.

export class NoImageError extends Error {} // provider worked but returned no picture
export class ProviderBusyError extends Error {} // rate limited / overloaded: try again soon
export class ProviderError extends Error {} // anything else went wrong
