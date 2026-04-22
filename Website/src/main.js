import Sigma from "sigma";
import Graph from "graphology";
import { parse } from "graphology-gexf";
import {bidirectional} from 'graphology-shortest-path';

import noUiSlider from 'nouislider';
import 'nouislider/dist/nouislider.css';

const communities = {
  "Hip-Hop":1, "Memphis Rap":9, "R&B":10, "Soul":38, "Vocal Jazz":11, "Instrumental Jazz":6, 
  /* Pop */ "Pop":26, "Indie Pop":36, "Underground Indie":39, "Soft Pop/Indonesia":3, 
  /* Electric */ "Electric Pop":40, "Synthwave":0, "Ambient":2, "Ambient Electronic":18, "Chill Electronic":16, "Ambient Piano":29, "Shoegaze":24, "Industrial":35,
  /* Rock */ "Classic 60s Rock":8, "Classic 80s Rock":7, "Indie/Alternative Rock":4, "Progressive Rock":34, "Grunge Rock":37, "Punk Rock":5,  "Metal":22,
  "Country":15,
  /* Brazilian */ "Bossa Nova":25, "Brazilian":13,"Reggaeton":23,"Reggae":14,"Salsa":12,
  /* Language */ "Spanish Pop":17, "Nigeria":32, "French":27, "Chile":19, "Japanese":20, "Chinese":28, "K-pop Boy Groups":30, "K-pop Girl Groups":31,
  /* Instrumental/Orchestra */ "Soundtrack":33, "Classical":21 //This is my own intereptation of the data from the tags of each artist found in each community, seen in the folder Backend_Code\FrequencyGraphs\FrequencyGraphImages.
  //The genres are ordered this way to group them as best as possible
};

//Colours
const backgroundColour = [53, 53, 53]; //Taken from the hexadecimal #353535 found in sigma container in styles.css

const fadedAdditionEdge = 4; //The smaller the value is, the closer it is to the background (and therefore the harder it is to see). 
const fadedEdgesColour = [backgroundColour[0] + fadedAdditionEdge, backgroundColour[1] + fadedAdditionEdge, backgroundColour[2] + fadedAdditionEdge];

const fadedAdditionNode = 27; //The smaller the value is, the closer it is to the background (and therefore the harder it is to see). The nodes should be a little brighter than the edges.
const fadedNodesColour = [backgroundColour[0] + fadedAdditionNode, backgroundColour[1] + fadedAdditionNode, backgroundColour[2] + fadedAdditionNode]; 

//Container
const container = document.getElementById("sigma-container");

//Control Panel: Search for Artist
const artistSearch = document.getElementById("artist-search");
const searchButton = document.getElementById("search-button");

//Shortest Path HTML Elements
const pathArtistOne = document.getElementById("path-artist-1")
const pathArtistTwo = document.getElementById("path-artist-2")
const pathButton = document.getElementById("path-button");

//Reset
const resetButton = document.getElementById("reset");

//Search for Genres
const genreInput = document.querySelector('input[list="genre-options"]');
const genreOptions = document.getElementById('genre-options');

//Ranges
const similarityRange = document.getElementById("similarity-range");
const listenersRange = document.getElementById("listeners-range");

//Metadata Panel: Updated related artists
const relatedArtists = document.getElementById("related-artists");
const relatedArtistsTitle = document.getElementById("related-artists-title");

let graph, renderer;

// Type and declare internal state: This is used for global variables that resemble with a graph. If there are multiple graphs, then there have to be multiple States. Also it's just nice to have everything in one place
class State {
    hoveredNode; //When the mouse is above a node but not clicked
    highlightNodes = []; //All the nodes that need to be highlighted
    showhighlightNodesNeighbours = true; //All the neighbour nodes of the highlighted nodes. Seen when we click a node (because we want to see that node's neighbours) but not when we see a path or community (when we only want to see those nodes).
    displayShortestPath = false; //Now we want to see nodes by community, we have to distinguish whether we want to see the shortest path.

    selectedNode; // State derived from query:
    suggestions = new Set();

    // State derived from hovered node:
    hoveredNeighbors = new Set(); 

    similarityRangeMin = 0; //Used for the handles of the similarity slider, initally at 0 and 1 to have the whole range
    similarityRangeMax = 1;
    
    listenersRangeMin = 0; //Used for the handles of the similarity slider, initally at 0 and 1 to have the whole range
    listenersRangeMax = 0;

  }
const state = new State();

function combineSetAndArray(set, array) { //Sets are faster than arrays, and store everything uniquely. If there is an item in the array that's already in the set, .add(item) will be ignored.
  let newSet = set;
  for (let item of array) {
    newSet.add(item);
  }
  return newSet;
}

function returnRGBString(array) { //Given an array of 3 indices, returns the RGB String associated
  let color = "rgb(" + array[0] + ", " + array[1] + ", " + array[2] + ")";
  return color;
}

function addTransparency(colour, transparency) { //Given a colour, it finds the balance between that colour and the background colour dependent on the transparency. In essence, fading it. 
  //Colour is in the string form: "rgb(x, x, x)"
  let colourArray = ['', '', '']; //Each index corresponds to the rgb values, so like [128,128,128]
  const targetArray = backgroundColour; //This is the background as a rgb value. The idea is that this represents 100% transparency (as any colour that is set to this won't be seen.)
  //We need a scale from the original rgb colour to the target. 
  let rgb = 0;
  colour = colour.trim(); //Removing all unnecessary spaces in case they are there

  for (let character = 4; character < colour.length; character++) {
     if (colour.charAt(character) == ",") {
      rgb++; //We've extracted all the numbers from the previous value, so we can move on to the next in the rgb series.
      continue
     } else if (colour.charAt(character) == ")") {
      break; //We've reached the end of the string
     }
     colourArray[rgb] += colour.charAt(character);
  }

  let colourScale; 
  for (let colourIndex = 0; colourIndex < colourArray.length; colourIndex++) { //Either red, green, or blue (depending on colourIndex)
    colourArray[colourIndex] = Number(colourArray[colourIndex]) //Casting it to an integer
    colourScale = targetArray[colourIndex] - colourArray[colourIndex] //Finding the difference between the current colour value and the target
    colourScale *= (1 - transparency); //Scaling it to our colour range
    colourArray[colourIndex] = Math.round(colourArray[colourIndex] + colourScale); //Replacing it in the list
  }

  return `rgb(${colourArray[0]}, ${colourArray[1]}, ${colourArray[2]})`;
}

function updateArtistPathLabels(value) {//Updates the pathArtist text boxes automatically. The first one is selected, unless there's something there already.
  if (pathArtistOne.value == "") {
    pathArtistOne.value = value; //If we're updating the display, we should update these too.
  } else {
    pathArtistTwo.value = value;
  }
}

function updateMetadata(node) {//Creates all the text for the metadata panel dependent upon the node
  let artistName = graph.getNodeAttribute(node, "artist_name"); //Using a variable just for this since we need it twice
  document.getElementById("artist-name").textContent = artistName;

  const genreCommunity = Object.keys(communities).find(key => communities[key] === graph.getNodeAttribute(node, "communityID")); //Finding the community of the node, and seeing which genre it's associated with in the dictionary

  let tags = graph.getNodeAttribute(node, "tags");
  tags = tags.replace(/\[|\]/g,'').split(',').map(item => item.trim().replace(/'/g, '')); //This turns a stringifed array like '['A', 'B', 'C']' into an array ['A', 'B', 'C']
  let tagString = "";
  for (let tag of tags) {
    tagString += tag + ", " //Getting rid of the first and last characters since they're single quotes
  }
  document.getElementById("artist-tags").textContent = `Tags: ${tagString.slice(0, tagString.length - 2)}`; //.length - 2 to get rid of the comma and space at the end
  document.getElementById("artist-genre").textContent = `Genre: ${genreCommunity}`;
  document.getElementById("artist-popularity").textContent = `Listeners: ${graph.getNodeAttribute(node, "listeners")}`;

  relatedArtists.innerHTML = ""; //Clear the old list

  let messages = []; //Array of dictionaries, to be sorted by weight later

  for (let neighbourNode of graph.neighbors(node)) {
    let artistName = graph.getNodeAttribute(neighbourNode, "artist_name");
    let edgeWeight = graph.getEdgeAttribute(graph.edge(node, neighbourNode), "weight");
    let similarity = (edgeWeight * 100).toFixed(2) + "%"; //toFixed(2) keeps the trailing 0s. 
    messages.push({"message":`${artistName} who is ${similarity} similar`, "weight":edgeWeight});
  };

  messages.sort((a, b) => b.weight - a.weight); //Sort by high to low

  messages.forEach(message => {
    const li = document.createElement("li"); //A li item (basically a bullet point)
    li.textContent = message["message"];
    relatedArtists.appendChild(li);
  })
}

function reset() { //Resets all the variables to their initial state, so the graph can look like it did when the website loaded
  state.highlightNodes = [];
  state.hoveredNode = undefined;
  state.hoveredNeighbors = new Set();
  
  state.suggestions = new Set();
  state.selectedNode = undefined;
  state.showhighlightNodesNeighbours = true; 
  state.displayShortestPath = false;

  pathArtistOne.value = "";
  pathArtistTwo.value = "";

      // Refresh rendering
    renderer.refresh({
      // We don't touch the graph data so we can skip its reindexation
      skipIndexation: true,
    });
}

function convertScale(initialNumber, maxNumber) {
    //Given an initialNumber between 0 and 1, it'll convert it to 0 and maxNumber.
    //Presume for now that we want it between 1 - maxNumber and 1. 
    
    const scale = 1 / maxNumber;
    return (initialNumber / scale);
}

function errorAnimate(input) {
  input.classList.add("search-error"); //See the CSS
  setTimeout(() => input.classList.remove("search-error"), 1000); //Remove it after a second.
}

function setHoveredNode(node) { //Set the hoveredNode to the node
    if (node) { //Used when the mouse moves on the node
      state.hoveredNode = node; //Selecting the node 
      state.hoveredNeighbors = new Set(graph.neighbors(node)); //Storing the node's neighbours
    }

    if (!node) { //Used when the mouse moves away from the node
      state.hoveredNode = undefined;
      state.hoveredNeighbors = new Set();
    }
    
    // Refresh rendering
    renderer.refresh({
      // We don't touch the graph data so we can skip its reindexation
      skipIndexation: true,
    });

}

function selectNode(node) {//When the user either clicks or selects a node, we call this to update.
  state.displayShortestPath = false;
  updateMetadata(node);
  updateArtistPathLabels(graph.getNodeAttribute(node, "artist_name"));

  if (!(state.highlightNodes.includes(node))) {
    state.highlightNodes.push(node); //Node is the same as hovered node (because the mouse is on top of it)
  }

  relatedArtistsTitle.textContent = "Top Related Artists";

  renderer.refresh({
    skipIndexation: true, //Update the graph, just in case the user has deselected the node.
  });
}

function addUserNode(query, refresh) { //Takes the user input and finds the node they're trying to search for
  query = query.trim(); //Trimming any unnesscary white space before or after the string.
  const lcQuery = query.toLowerCase();
  const suggestions = graph
          .nodes()
          .map((n) => ({ id: n, label: graph.getNodeAttribute(n, "label")}))
          .filter(({ label }) => label.toLowerCase().includes(lcQuery));
  state.suggestions = new Set(suggestions.map(({ id }) => id));

  if (state.suggestions.size == 0) {
    return "ERROR: invalidArtist"; //Artist wasn't found
  }
    
  let foundNode;
  for (let suggestion of suggestions) {
    if (suggestion.label == query) {
      foundNode = suggestion.id; //There was an exact match with the query that we got. Let's use this rather than our best suggestion.
    }
  }
  if (foundNode == undefined) {
    foundNode = suggestions[0].id; //ERROR - This is really bad at the moment. We just choose the first one since it's the most likely one. In future, it would be nice to show all the suggestions and let the user pick the one they meant.
  }

  let nodeListeners = graph.getNodeAttribute(foundNode, "listeners");
  if (nodeListeners > state.listenersRangeMax || nodeListeners < state.listenersRangeMin) { //We could find the artist but it's currently hidden due to the threshold.
    state.suggestions = new Set(); //Make sure the nodes that were suggested were empty, back to normal.
    return "ERROR: nodeListenersNotInRange";
  }

  if (!(state.highlightNodes.includes(foundNode))) {
    state.highlightNodes.push(foundNode);
  }

  state.suggestions = new Set();

  if (refresh) { //If false, then we just return back the node we were looking for. Otherwise, we'll update the graph.
    state.selectedNode = foundNode;
    updateArtistPathLabels(graph.getNodeAttribute(state.selectedNode, "artist_name"));
    updateMetadata(state.selectedNode);

    const nodePosition = renderer.getNodeDisplayData(state.selectedNode);
    
    relatedArtistsTitle.textContent = "Top Related Artists";

    renderer.getCamera().animate(nodePosition, {
      duration: 500
    });

    renderer.refresh({
      skipIndexation: true,
    });
    
  }

  return foundNode;
}

function displayShortestPath () {//Displays the shortest path between two nodes by highlighting all the nodes on the path
  
  let sourceNode,  targetNode;
  //Since the code is identical, there might be a way to use a nested function to save space. But for now this works.

  if (pathArtistOne.value != "") {
    sourceNode = addUserNode(pathArtistOne.value, false); //If there's something in the text box we try that first.
  }

  if (sourceNode == "ERROR: invalidArtist" || sourceNode == undefined) {
      sourceNode = state.highlightNodes[0]; //If the sourceNode is invalid, we just use whatever the user clicked on first.

      if (sourceNode == undefined) {
        errorAnimate(pathArtistOne); //If the user hasn't clicked anything then we return nothing.
        return;
      }
  } else if (sourceNode == "ERROR: nodeListenersNotInRange") {
    errorAnimate(pathArtistOne); //The artist we searched for has more listeners than the threshold. Let's stop here.
    return;
  }
  
  pathArtistOne.value = graph.getNodeAttribute(sourceNode, "label"); //In case it's different, show it so it's obvious what the source node is.

  if (pathArtistTwo.value != "") { //Exact same logic as pathArtistOne
    targetNode = addUserNode(pathArtistTwo.value, false);
  }
  if (targetNode == "ERROR: invalidArtist" || targetNode == undefined || targetNode == sourceNode) {
    targetNode = state.highlightNodes[state.highlightNodes.length - 1];

    if (targetNode == undefined || targetNode == sourceNode) {
        errorAnimate(pathArtistTwo); //If the user hasn't clicked anything (or it's the same node, because there's no point) then we return nothing.
        return;
      }
  } else if (targetNode == "ERROR: nodeListenersNotInRange") {
    errorAnimate(pathArtistTwo); //The artist we searched for has more listeners than the threshold. Let's stop here.
    return;
  }

  pathArtistTwo.value = graph.getNodeAttribute(state.highlightNodes[state.highlightNodes.length - 1], "label"); //If there is no value there, show it so it's obvious what the source node is.

  const path = bidirectional(graph, sourceNode, targetNode); //Graphology function which calculates the path, and returns back the nodes from the sourceNode to the targetNode

  relatedArtists.innerHTML = "";
  let nodeCounter = 0;
  for (let node of path) {
    state.highlightNodes.push(node) //Add it to the nodes to be displayed
    if (nodeCounter != 0) { //Probably an easier way to do this, but from when nodeCounter is 1 onwards, we connect nodeCounter - 1 to nodeCounter (so 0 to 1, 1 to 2)'s names so (A to B, B to C)
      const li = document.createElement("li"); //Create a new list item
      li.textContent = `${graph.getNodeAttribute(path[nodeCounter - 1], "artist_name")} connects to ${graph.getNodeAttribute(path[nodeCounter], "artist_name")}`;
      relatedArtists.appendChild(li);
    }
    nodeCounter++;
  }
  relatedArtistsTitle.textContent = "Connecting Artists";

  state.showhighlightNodesNeighbours = false; //We just want to see the path.
  state.displayShortestPath = true;

  renderer.refresh({
      skipIndexation: true,
  });
}

function showCommunityNodes(communityID) { //All the nodes that have the communityID are added to highlightNodes
  state.highlightNodes = [];
  state.showhighlightNodesNeighbours = false;
  graph.forEachNode(node => {
    if (graph.getNodeAttribute(node, "communityID") == communityID) {
      state.highlightNodes.push(node);
    }
  });

  renderer.refresh({
      skipIndexation: true,
  });
}

function readUserNode() { //Calls addUserNode() to add the node the user searched.
  if (addUserNode(artistSearch.value || "", true).startsWith("ERROR")) {
    //We weren't able to find the artist. So let's display that information to the user.
    errorAnimate(artistSearch);
    return;
  }
}

function main() {
  //All the eventListeners for the HTML Elements
  artistSearch.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        readUserNode();
      }
  });

  searchButton.addEventListener("click", () => {
    readUserNode();
  });

  for (let community in communities) { //Creating the drop-down list for the filter by genre
    const option = document.createElement('option');
    option.value = community;
    genreOptions.appendChild(option);
  }

  genreInput.addEventListener('input', function(e) {
      const selectedValue = e.target.value;
      
      if (selectedValue in communities) { // Check if the value matches one of the pre-established categories
        showCommunityNodes(communities[selectedValue])
      }
  });

  pathButton.addEventListener("click", () => {
    displayShortestPath();
  });

  noUiSlider.create(similarityRange, { //noUiSlider gives the double handle slider needed to make this work
    start: [0, 1], // The initial positions (the most extreme because we want to see the full graph)
    connect: true, // This creates the "pretty" bar
    range: {
        'min': 0,
        'max': 1
    },
    step: 0.01,
    pips: { // Show a scale with the slider
      mode: 'count',
      values: 6, //This splits it into 5 even sections, so we need 6 numbers
      format: {
            // Making the numbers remain as decimals and not rounded.
            to: function (value) {
                return value.toFixed(1); // Returns "0.1", "0.2"
            },
            from: function (value) {
                return Number(value);
            }
        }
    }
  });

  resetButton.addEventListener("click", () => {
    reset();
  });

  fetch("artistsColouredTaggedGephi.gexf") //Get the file and turn it into a graph Graphology understands
    .then(res => res.text())
    .then(gexf => {
      graph = parse(Graph, gexf);
      console.log("Graph loaded! Nodes:", graph.order);

      renderer = new Sigma(graph, container, {//Creating a renderer
        labelRenderedSizeThreshold : 15,
        minCameraRatio: 0.01, // Minimum zoom (zoomed in)
        maxCameraRatio: 1,  // Maximum zoom (zoomed out)
        enableEdgeEvents: false,
        zIndex : true, //Allow for layering of nodes (initally bigger nodes get layered on top)
        labelColor : {attribute: "labelColor", color: "rgb(210, 210, 210)"} //Initally the labels are white to contrast with the dark background.
        
      });

      let maximumListeners = -1; //We can do something to find out the maximum size of listeners. Whilst attributing the necessary sizes and labels, we'll use a variable to check the maximum.

      graph.forEachNode((node, attributes) => {
          graph.setNodeAttribute(node, "size", attributes.size / 4);
          graph.setNodeAttribute(node, "label", attributes.artist_name); //Currently it's the MBID, but the artist's name is much more understandable.
          graph.setNodeAttribute(node, "zIndex", 10); //Let each node have a value of 10, to allow for nodes to have 0 (and therefore lower) values later. 1 should work, but giving it a little bit of buffer room.
          if (attributes.listeners > maximumListeners) {
            maximumListeners = attributes.listeners;
          }
      });

      //Now we can update the range of the listeners slider. Set it to the fullest range of the graph (maximumListeners).
      
      let listenersStep = Math.round(maximumListeners / 500); //Dividing the bar 
      
      if (listenersStep == 0) {
        listenersStep = 1; //Just in case somehow the number was less than 1 and got rounded down to 0
      }

      let listenersMax = Math.round(maximumListeners + maximumListeners / 100); //Just add 1% for a little bit of breathing room. It's because when we reduce and increase again, we aren't reaching the maximum anymore due to how step and the slider works.

      noUiSlider.create(listenersRange, {
        start: [0, listenersMax], // The initial positions (the most extreme because we want to see the full graph)
        connect: true, // This creates the "pretty" bar
        range: { //Implementing a logirthmic scale, since a lot of the nodes have small numbers of listeners. UPDATE: Currently, these numbers are made up so it would be nice to make them better.
            'min': 0,
            '10%':1000,
            '50%':100000,
            'max': listenersMax
        },
        step: listenersStep,

        pips: { // Show a scale with the slider
          mode: 'count',
          values: 6, //Keep it the same as the similarity scale
          format: {
            to: function (value) {
                if (value >= 1000000) return (value / 1000000).toFixed(1) + 'M'; //This is to decrease the size of the text, changing 1000000 to 1M. toFixed(1) means 1 decimal place
                if (value >= 1000) return (value / 1000).toFixed(0) + 'K'; //This is to decrease the size of the text, changing 1000 to K. toFixed(0) means no decimal places
                return value;
            }
          }
        }
      });
      
      listenersRange.noUiSlider.on('update', function (values, handle) {
        if (handle == 0) { //We've selected the left handle.
          state.listenersRangeMin = values[handle];
        }
        if (handle == 1) { //We've selected the right handle.
          state.listenersRangeMax = values[handle];
        }
        renderer.refresh({
          // We don't touch the graph data so we can skip its reindexation
          skipIndexation: true,
        });
      });

      similarityRange.noUiSlider.on('update', function (values, handle) {
        if (handle == 0) { //We've selected the left handle.
          state.similarityRangeMin = values[handle];
        }
        if (handle == 1) { //We've selected the right handle.
          state.similarityRangeMax = values[handle];
        }
        renderer.refresh({
          // We don't touch the graph data so we can skip its reindexation
          skipIndexation: true,
        });
      });

      graph.forEachEdge((edge, attributes, source, target) => {
          let sourceColour = graph.getNodeAttribute(source, "color");
          graph.setEdgeAttribute(edge, "baseColour", sourceColour);
          if (attributes.weight == undefined) { //ERROR: This is bad. This means there are edges with no weight attribute for some reason.
            attributes.weight = 0.5; //Assign a weight halfway between 0 and 1.
          }
          let transparency = convertScale(attributes.weight, 0.4) //Making any edge connection's transparency between two nodes a maximum of 0.4, so we can see the graph without hurting our eyes.
          sourceColour = addTransparency(sourceColour, transparency);
          graph.setEdgeAttribute(edge, "color", sourceColour);
          graph.setEdgeAttribute(edge, "zIndex", 10); //Let each node have a value of 10, to allow for nodes to have 0 (and therefore lower) values later, so that they're drawn below the graph. 
          // 1 should work, but giving it a little bit of buffer room.
      });

      // Bind graph interactions:
      renderer.on("enterNode", ({ node }) => {//Mouse has hovered over a node
          setHoveredNode(node);
      });

      renderer.on("clickNode", ({ node }) => {
        state.showhighlightNodesNeighbours = true; //In case the shortest path is still showing, deselect it.
        if (state.selectedNode == node) {
          state.selectedNode = undefined; //Unhighlight the node if it's been selected.
        } else {
          state.selectedNode = node; //Highlight the node.
        }
        selectNode(node)
      });

      renderer.on("leaveNode", () => {//Mouse has stopped hovering over a node
        setHoveredNode(undefined);
      });

      renderer.on("downStage", () => {//Mouse clicks on the grey part of the graph
        state.selectedNode = undefined; //Deselect the node.
          // Refresh rendering
        renderer.refresh({
          // We don't touch the graph data so we can skip its reindexation
          skipIndexation: true,
        });
      });

    // Render nodes accordingly to the internal state:
    // 1. If a node is selected, it is highlighted
    // 2. If there is query, all non-matching nodes are greyed
    // 3. If there is a hovered node, all non-neighbor nodes are greyed
    renderer.setSetting("nodeReducer", (node, data) => {
        const res = { ...data };

        if (res.listeners > state.listenersRangeMax || res.listeners < state.listenersRangeMin) {
          res.hidden = true;
          return res; //Don't do any more updating, we're hiding the node
        }

        if (state.selectedNode === node) {
          res.highlighted = true;
          res.labelColor = "#000000" // Since the node is selected, the white background behind the label appears. So change it from white to black to see it better.
        }

        if (state.hoveredNode === node) {
          res.labelColor = "#000000"  // Since the node is being hovered on, the white background behind the label appears. So change it from white to black to see it better.
        }

        let displayNodes = combineSetAndArray(state.hoveredNeighbors, state.highlightNodes); //These are all the nodes we want to see. This seems quite inefficient though. 
        for (let node of state.highlightNodes) {
          if (state.showhighlightNodesNeighbours) {
            for (let neighbourNode of graph.neighbors(node)) {
              displayNodes.add(neighbourNode); //Making sure all the neighboured nodes are highlighted.
            }
          }
        }

        if ((displayNodes.size != 0 && !displayNodes.has(node) && state.hoveredNode !== node)) {
          res.label = "";
          res.color = returnRGBString(fadedNodesColour); //Fading the nodes - that grey thing that happens
          res.zIndex = 0; //Layer them below the nodes that we want to see. 
        }

        if (state.suggestions.size != 0) {
          if (state.suggestions.has(node)) {
            res.forceLabel = true;
          } else {
            res.label = "";
            res.color = "#f6f6f6";
          }
        }

        return res;
    });

    // Render edges accordingly to the internal state:
    // 1. If a node is hovered, the edge is hidden if it is not connected to the
    //    node
    // 2. If there is a query, the edge is only visible if it connects two
    //    suggestions
    renderer.setSetting("edgeReducer", (edge, data) => {
      const res = { ...data };

      if (!(state.showhighlightNodesNeighbours)) {
        //If this is true then we don't want to see any of the neighbours.
        if (graph.extremities(edge).every((n) => state.highlightNodes.includes(n))) {
              if (state.displayShortestPath) {
                res.color = "rgb(255,255,255)" //If this is false, then we want to see the path. So we should make the edges really stand out - especially against the nodes that are being drawn over the edges.
              }
              return res;
            }
        res.color = returnRGBString(fadedEdgesColour); //Fading the edges - that grey thing that happens
        res.zIndex = 0; //Layer them below the edges that we want to see. 
        return res;
      }
      
      let colouredEdge = state.highlightNodes.length == 0 && !(state.hoveredNode);
      let displayNodes;
      if (state.highlightNodes.length != 0) {
        displayNodes = [...state.highlightNodes,  state.hoveredNode];
      } else {
        displayNodes = [state.hoveredNode];
      }
      
      for (let node of displayNodes) {
        if (
          node && graph.extremities(edge).every((n) => n === node || graph.areNeighbors(n, node))
        ) {
          colouredEdge = true;
        }
      }
      if (!(colouredEdge)) {

        res.color = returnRGBString(fadedEdgesColour);
        res.zIndex = 0;
      }

      if (
        state.suggestions.size != 0 && (!state.suggestions.has(graph.source(edge)) || !state.suggestions.has(graph.target(edge)))
      ) {
        res.hidden = true;
      }

      if (res.weight > state.similarityRangeMax || res.weight < state.similarityRangeMin) {
        res.hidden = true;
      }

      return res;
    });
  }).catch(err => console.error("Loading error:", err));
}

main();
