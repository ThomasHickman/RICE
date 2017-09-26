# RICE

An implementation of a market based scheduling system

## Documentation

The specification of how the market works is contained in the [docs](/docs.md) file.

## Running the marketplace

This is written in python, and all the files assume your writing this in python 3.6 (to support async io).

To run, you need to install the python requirements and a local mysql server

```bash
pip install -r requirements.txt
apt-get install mysql
```