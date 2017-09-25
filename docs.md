# Rice

## Goals
- Implement a market based scheduling system where a user can connect and pay to various providers and brokers, offering different commodities
- Implement AI provider and user brokers, that can learn efficient ways to price and compute resources

## Parts to be developed

- Market directory
- A central bank or a way to integrate with the blockchain
- Independent authority to manage transactions
- User brokers
- Provider brokers
- Meta brokers which can create double auctions when needed

## Compute commodities

In this market, there needs to be some definition of commodities - which are fixed specifications of computation such that they can be traded in an open market (you will be getting the same product regardless of where you trade it).

The commodities would need to defined in some kind of data structure. This specifies the requirements that the user should expect at the end of the computation (e.g. that it's allowed to run for a specified period), requirements of the provider (e.g. for some kinds of contracts that the input files are in a certain files) and the mechanism for working out the cost.

### Things that need to be inferred from the commodity declaration

1. Whether your system is able to provide the resource
2. The amount to charge the user, at the end of the contract
3. Whether a given contract is suitable for a given job
4. Whether one commodity which is suitable is likely to cost more or less than another commodity

### Commodity specification

#### Parameters

- `user_requirements`: `Predicate[]`
    A list of boolean expressions with variables assignments that should evaluate to true at the end of contract. The provider shouldn't take on a contract if they can't fulfil this at the beginning of the contract (e.g. providers need to check if they can fulfil the system check at the beginning of the contract)
- `provider_requirements`: `Predicate[]`
    A list of boolean expressions with variables assignments that should evaluate to true at the begin of contract, in order for providers to accept the contract.
- `evaluate_provider_script`: `ScriptDesc`
    A description of a python script which will provide extra variables for the `user_requirements` and `cost` section. This script should evaluate to the same value regardless of when it's evaluated. The script is evaluated through the `evaluate` function and should finish by 10 seconds.
- `evaluate_inputs_script`: `ScriptDesc`
    A description of a python script which will provide extra variables for the `provider_requirements` section. The script is evaluated through evaluating `evaluate(input: string)`, where `input` is the command used to run the job. The input files should also be in the file system at the time of running. This also should be expected to finish by 10 seconds.
- `cost`: `IfExpression`
    An expression that is evaluated at the end of the computation that specifies the cost of the computation. If the user requirements have been fulfilled correctly, then this amount is withdrawn out of the user's account.

#### Variables

- `waiting_time`: `Duration`
    The duration from when the deal is completed to when the computation starts
- `running_time`: `Duration`
    The duration from the start of the computation and when it is killed
- `killed_by`: `"user" | "provider"`
    The entity that kills the job.
- `can_rebuy`: `boolean`
    Whether you can rebuy this commodity to keep your instance active
- `times_rebought`: `number>0`
    Number of times you have bought this resource before

#### Types

- enum types as `"item1" | "item2" | "item3"`
- `boolean` and `number` as expected
- `Predicate`: a list of predicates separated by new lines. Predicates can use the operators `<`, `>`, `is`, `or` and `and`, between expressions.
- `IfExpressions`: Expressions, which can be nested in `if`, `else` blocks
- `Expressions`: Supports `+-*` with brackets and function calls in the expected way
- `Duration` is an interval, measured in seconds

#### Functions

- `round_down`: `(number, number) -> number`
    Rounds a number down in a specified interval
- `round_up`: `(number, number) -> number`
    Rounds a number up in a specified interval
- `min`: `(number, number) -> number`
    Finds the minimum of two numbers
- `min`: `(number, number) -> number`
    Finds the maximum of two numbers


### Example definitions:

Fixed time commodity:
```yml
evaluate_provider_script:
    file: correct_system.py
    outputs:
        - name: correct
          type: boolean
user_requirements: '''
    correct
    running_time > 3600 or killed_by is "user"
    waiting_time < 30
'''
cost: 1.5
```

Fixed time single/double auction:
```yml
evaluate_provider_script:
    file: correct_system.py
    outputs:
        - name: correct
          type: boolean
user_requirements: '''
    correct
    running_time > 3600 or killed_by is "user"
    waiting_time < 30
'''
cost: bid_price
```

Auction where you can claim back unused time:
```yml
evaluate_provider_script:
    file: correct_system.py
    outputs:
        - name: correct
          type: boolean
user_requirements: '''
    correct
    running_time > 3600 or killed_by is "user"
    waiting_time < 30
'''
cost: '''
    if (killed_by = "user")
        bid_price - (end_time - starting_time - 3600) * 0.0036 * 2
'''
```

Auction where the provider thinks it can guess the time taken for something to execute:
```yml
evaluate_inputs_script:
    file: correct_input.py
    outputs:
        - name: correct
          type: boolean
provider_requirements: '''
    correct
'''
user_requirements: '''
    killed_by = "user"
    waiting_time + running_time < 3600
'''
cost: '''
    file_length * bid_price
'''
```

#### Amazon services:

Amazon spot pricing:
```yml
get_provider_data:
    - name: average_spot_price
      type: number
evaluate_provider_script:
    file: correct_system.py
    outputs:
        - name: correct
          type: boolean
user_requirements: '''
    correct
    average_spot_price < bid_price
    waiting_time + running_time > 3600 or killed_by is "user"
    can_rebuy
'''
cost: '''
    if (killed_by = "provider")
        0
    else
        active_time * average_spot_price
'''
```

Amazon reserved pricing:

All upfront:

Commodity with id `123`:
```yml
cost: 340
```

```yml
depends_on: 123
evaluate_provider_script:
    file: correct_system.py
    outputs:
        - name: correct
          type: boolean
user_requirements: '''
    correct
    running_time > 60*60*24*365 or killed_by = "user"
    waiting_time < 30
'''
cost: 0
```

Partial upfront:

Commodity with id `321`:
```yml
cost: 180
```

```yml
depends_on: 321
evaluate_provider_script:
    file: correct_system.py
    outputs:
        - name: correct
          type: boolean
user_requirements: '''
    correct
    running_time > 60*60*30 or killed_by = "user"
    waiting_time < 30
    can_rebuy
    times_rebought < 12
'''
cost: 0.04
```

## Discovery Service

The discovery service finds providers for the user to connect with. It can either query specific commodities or query all possible providers:
```yml
request: query_providers
query: 123456
}
```

or

```yml
request: query_all
```

The response would be a list of servers that the user could connect, with the protocols that the client need to connect to them
```yml
status: ok
resources:
- id: 10
  location: 0.0.0.0
  type: double_auction
  commodity: "..."
- id: 11
  location: 0.0.0.0
  type: auction
  commodity: "..."
- id: 12
  location: 1.0.0.0
  type: direct
  commodity: "..."
```

Providers would also update the discovery server with updated stats about new expected pricing, minimum time to acquire the resource and types of resources that they accept e.g.
```yml
request: update_information
provider_id: 4
signature: "..."
new_information:
- id: 13
  location: 1.1.0.0
  type: direct
  commodity: "..."
```

Where `new_information` would contain information to be merged into the discovery server's information.

## Central bank

Each user would be allocated an account, which would have a private key associated with it (all requests to the bank would have to be signed by this key to determine authenticity). Every period of time the account would get topped up. To stop users gaining too much money, a tax system could be developed.

### Using the Blockchain

As a further development, the blockchain could be used - this would be a lot more decentralised, but you won't be able to implement taxation and their may be a time delay before processing of transactions happen.

## User brokers

The user brokers would need to be AI agents that learn to fulfil the user's requirements by choosing what provider to use and maybe participating in that provider's mechanism for trading e.g. an auction.

## Provider brokers

Providers have many ways of giving their resources to users
- Advertise a fixed price for resources (the provider needs to decide what resources are best to serve and what price it should give to them)
- Create a one sided auction for their resources
- Use a meta-broker to sell it's resources

The provider may also look to see if there are ways of creating commodities if it thinks it can predict the time taken for a given resource to be processed and try to find quicker ways of processing the data (e.g. maybe cache data, if this is a popular request)

## Specifying auctions

Two way auction:

```yml
commodity: "<commodity>"
deal_times: "<timestamp>+2000"
```

## Specifying jobs

To give a job to the provider, you need to specify a command on the command line and input files which would be read.