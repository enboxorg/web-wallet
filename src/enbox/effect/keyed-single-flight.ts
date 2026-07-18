type FlightOperation<T> = () => Promise<T>;

export interface KeyedSingleFlight {
  run<T>(scope: object, key: string, operation: FlightOperation<T>): Promise<T>;
}

/**
 * Join concurrent promise operations that address the same scoped resource.
 * Completed and failed operations are evicted so later recovery attempts still
 * reach the SDK and the network.
 */
export function makeKeyedSingleFlight(): KeyedSingleFlight {
  const flightsByScope = new WeakMap<object, Map<string, Promise<unknown>>>();

  return {
    run<T>(scope: object, key: string, operation: FlightOperation<T>): Promise<T> {
      let flights = flightsByScope.get(scope);
      if (!flights) {
        flights = new Map();
        flightsByScope.set(scope, flights);
      }

      const current = flights.get(key);
      if (current) {
        return current as Promise<T>;
      }

      const flight = Promise.resolve().then(operation);
      flights.set(key, flight);
      const cleanup = (): void => {
        if (flights.get(key) === flight) {
          flights.delete(key);
        }
      };
      void flight.then(cleanup, cleanup);
      return flight;
    },
  };
}

const walletSetupFlights = makeKeyedSingleFlight();

/** Join concurrent sync-scope setup for one DID in the current agent session. */
export function runIdentitySetupSingleFlight<T>(
  agent: object,
  did: string,
  operation: FlightOperation<T>,
): Promise<T> {
  return walletSetupFlights.run(agent, JSON.stringify(['identity-setup', did]), operation);
}

/** Join concurrent tenant registration for one DID and one remote endpoint. */
export function runRegistrationSingleFlight<T>(
  agent: object,
  did: string,
  endpoint: string,
  operation: FlightOperation<T>,
): Promise<T> {
  return walletSetupFlights.run(
    agent,
    JSON.stringify(['registration', did, endpoint]),
    operation,
  );
}
