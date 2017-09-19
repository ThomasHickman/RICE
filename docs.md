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
- Meta brokers which can create double auctions when needed, and gain a cut

## Compute commodities

In this market, there needs to be some definition of commodities - which are fixed specifications of computation, such that they can be traded in an open market (you will be getting the same product regardless of where you trade it).

The commodities would need to defined in a "SLA". This definition would specify certain conditions that have to be delivered (i.e. providers need to provide this) and a formula for determining the cost that is charged to the user,
(look at this http://www.gridway.org/doku.php?id=documentation:release_5.14:ug#requirement_and_rank_variables)

Variables that could be provided to the requirements and cost formulas.

## Things that need to be interpreted from the commodity definition files:

1. Whether your system is able to provide the resource
To do this:
- Run system_check to get the correct system variables
- Check any clauses that use variables defined here are correct
2. The amount to charge the user, at the end of the contract
- Evaluate the cost with the given parameters
3. Whether a given contract is suitable for a given job
- See if provider_requirements evaluates correctly for a given job
4. Whether one commodity which is suitable is likely to cost more or less than another commodity

Commodities parameters:

- `system_check`: `Filename | CheckStruct`
    A python script such that `evaluate()[0] == True`. The discovery service could keep copies of these files as a standard of different environments (e.g. you could have a windows environment)
- `input_check`: `Filename | CheckStruct`
    A python script that evaluates to true if . The discovery service could keep copies of these files as a standard of different environments (e.g. you could have a windows environment) 
- `user_requirements`: `Predicates`
    A list of boolean expressions that all need to be true, in order for the contract to be considered to be fulfilled.
- `cost`: `Expression`
    An expression that is evaluated at the end of the computation that specifies the cost of the computation. If the user requirements have been fulfilled correctly, then this amount is withdrawn out of the user's account.
- `provider_data`: `Parameter[]`
    Parameters that are specified by the provider at the end of the contract, that can be used in the cost field, and have to be fulfilled by the user requirements. Past values of this can be revealed to users.
- `depends_on`: `number`
    You can only buy this resource if you have bought this previous resource

Variables:

- `end_time`: `Timestamp`
    The time at which the job finishes (as a result of the user or provider killing the task)
- `starting_time`: `Timestamp`
    The time at which the job starts running
- `deal_time`: `Timestamp`
    The time at which the deal is agreed
- `killed_by`: `"user" | "provider"`
    The entity that kills the job.
- `can_rebuy`: `boolean`
    Whether you can rebuy this commodity to keep your instance active
- `times_rebought`: `(number, >0)`
    Number of times you have bought this resource before

Where `Timestamp` is a timestamp, in UNIX time.

Example definitions:

Fixed time commodity:
```yml
system_check: correct_system.py
user_requirements: 
    - end_time - starting_time > 3600 or killed_by = "user"
    - starting_time - deal_time < 30
cost: 1.5
```

Fixed time single/double auction:
```yml
system_check: correct_system.py
user_requirements: 
    - end_time - starting_time > 3600 or killed_by = "user"
    - starting_time - deal_time < 30
cost: bid_price
```

Auction where you can claim back unused time:

```yml
system_check: correct_system.py
user_requirements: 
    - end_time - starting_time > 3600 or killed_by = "user"
    - starting_time - deal_time < 30
cost: '''
    if (killed_by = "user"){
        bid_price - (end_time - starting_time - 3600) * 0.0036 * 2
    }
'''
```

Auction where you think you can guess the time taken for something to execute:
```yml
user_check: is_correct_file
user_requirements: '''
    killed_by = "user"
'''
cost: '''
    file_length * bid_price
'''
```

Amazon services:

Amazon spot pricing:
```yml
system_check: correct_system.py
provider_data:
    average_spot_price: 
        type: number
        last_advertised: 10
user_requirements:
    - average_spot_price < bid_price
    - end_time - deal_time > 3600 or killed_by = "user"
    - can_rebuy
cost: '''
    if (killed_by = "provider"){
        round_down(active_time * average_spot_price, 3600)
    }
    else{
        active_time * average_spot_price
    }
'''
```

Amazon reserved pricing:

All upfront:

Commodity with id `123`:
```yml
cost: 340
```

```yml
system_check: correct_system.py
depends_on: 123
user_requirements: '''
    end_time - starting_time > 60*60*24*365 or killed_by = "user"
    starting_time - deal_time < 30
'''
cost: 0
```

Partial upfront:

Commodity with id `321`:
```yml
cost: 180
```

```yml
system_check: correct_system.py
depends_on: 321
user_requirements: '''
    end_time - starting_time > 60*60*30 or killed_by = "user"
    starting_time - deal_time < 30
    can_rebuy
    times_rebought < 12
'''
cost: 0.04
```

This language has comparison operators `<`, `>`, `=`; logical comparison operators `and` and `or` and `not`; maths operators `+-*/`; and a function `$(...)` which execute and returns the stdout of a command run in a docker container with the input file in the filesystem. In auctions, a variable called `bid_price` can be used, which contains the bid price at the end of the auction.

On a deal, this contract is fed into an independent service which will arbitrate the contract. After the computation has been finished, both the user and provider would give what they think they parameters should be. If they agree to a acceptable degree (i.e. the end cost doesn't differ) by a great amount, the user is charged the average of the two amounts.

## Specifying auctions

Two way auction:

This is when after a period of time, the 
```yml
commodity: <commodity>
deal_times: "<timestamp>+2000"
```

## Discovery Service

To discover providers that can fulfil a user's job, the user broker can query a discovery server that will return a list of available providers that can be connected to. This would contain parameters as to what the user wants to be queried e.g.:
```json
{
    "request": "query_providers",
    "query": 123456
}
```

The response would be a list of servers that the user could connect, with the protocols that the client need to connect to them. Also, information about their usage (to help the provider determine the best server to go with) is provided. This may include parameters like amount of clients connecting, time to connect. An example response would be:
```json
{
    "status": "ok",
    "resources": [
        {
            "id": 10,
            "location": "0.0.0.0",
            "type": "double_auction",
            "parameters": "..."
        },
        {
            "id": 10,
            "location": "0.0.0.0",
            "type": "auction",
            "parameters": "..."
        },
        {
            "id": 13,
            "location": "1.0.0.0",
            "type": "commodity",
            "parameters": "..."
        }
    ]
}
```

Providers would also update the discovery server with updated stats about new expected pricing, minimum time to acquire the resource and types of resources that they accept e.g.
```json
{
    "request": "update_information",
    "provider_id": 4,
    "signature": "...",
    "new_information": [
        {
            "id": 13,
            "location": "1.1.0.0",
            "type": "commodity",
            "parameters": {
                "SLA": "...",
                "auction_interval": 1000
            }
        }
    ]
}
```

Where `new_information` would contain information to be merged into the discovery server's information.

## Communication between users and providers


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

## Implementation details

The discovery and central bank servers can all be restful servers. Once a provider has been found, the interaction between the provider broker and the user broker could be implemented over a secure TCP connection