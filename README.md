# Artist Similarity Network 🚀

See the full website at: [Artist Network](https://jpstar29.github.io/Artist-Network)

This project displays an artist similarity network in a website. This was done through 3 stages: creating a dataset, creating a networked graph from that dataset (exporting said graph to Gephi), then building the
website to interact with the graph.

## 🛠 Installation

Install all Python libraries with: 

```
pip install -r requirements.txt
```

Install my-project with npm:

```bash
  npm install my-project
  cd my-project
```

## 🛠 Backend Code

If you'd like to run the dataset for yourself to generate new artists, you will need an API Key from Last.fm API and a personal email address for the MusicBrainz API.
You can generate an API key from Last.fm by doing the following steps:

* 
* 
* 

Alternatively, see [Last.fm's guidelines](https://en.wikipedia.org/wiki/The_1975) for further details.

In Backend Code\Text Files\KEYS.txt, you will see two lines of text - "API KEY" and "example@gmail.com". Please replace these with your exact API Key and your exact email address - no spaces before or after.
From there, you can run the dataset, with any artists you desire at whatever depth you desire.

If you'd like to change the name of the dataset you're writing to, please don't create a new CSV file. Instead, in createDataset.py on Line 14, change datasetName to whatever you desire (something that a CSV file could be named).
The program will automatically create a new dataset with that file. All datasets are stored in Backend_Code\CSV_Files.

Currently, the dataset gets updated every 25 artists - which takes approximately a minute. If you'd like to see artists being generated faster, you can reduce this number by changing updateDataset on line 35 - but it's strongly recommended not to go under 10 (it's a bit overkill to be saving to the csv that often). In general, somewhere between 25 to 75 is ideal if you want to run the dataset overnight.

If the program does terminate (likely due to being disconnected from the Internet, many measures have been taken to deal with API errors) simply run it again, asking to continue rather than load. It'll automatically resume gathering artists from when it last saved.

Similarly, if the dataset finishes generating artists, and you'd like to generate more artists - just say "Yes" to continuing and "Continue" to continue - the previous save point will start loading the next depth.

**PLEASE DO NOT DELETE THE CODE DESIGNED TO WAIT FOR THE API.**
The author assumes no responsibility by taking this code and using it to spam API requests. Doing as such is prohibited by the APIs, and will likely cause a ban. 

## 🛠 Frontend Code

Vite was used to see the website. With node packet manager, you can run npm run dev. From there, press o and then enter, and the website will load on a local server.