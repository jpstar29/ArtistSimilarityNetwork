#Generating the dataset we need for our project

import pandas as pd
import random
import copy
import requests
import time
import os
import datetime

BASE_URL = "https://ws.audioscrobbler.com/2.0/"
MBID_URL = "https://musicbrainz.org/ws/2/artist/" # MusicBrainz API endpoint

if not os.path.exists(r"Backend_Code\CSV_Files"):
    os.makedirs(r"Backend_Code\CSV_Files") #CSV_Files may not be a created folder. So we have to create it. This is included in the gitignore.

datasetName = "artistSimilarities"
csvFilenameGradual = r"Backend_Code\CSV_Files\%s.csv" %(datasetName)

lastArtistFilename = r"Backend_Code\Text Files\lastArtist.txt"
keysFilename = r"Backend_Code\Text Files\KEYS.txt"
artistsAtDepthFilename = r"Backend_Code\Text Files\artistsCompletedAtDepth.txt"

with open(keysFilename, "r", encoding='utf-8') as f:
    keys = f.read().split("\n")
    API_KEY = keys[0]
    if API_KEY == "API_KEY":
        raise RuntimeError("Invalid API Key. Please create a real API Key (consult the README).")
    if keys[1] == "example@gmail.com":
        raise RuntimeError("Invalid email address. Please input a real email address, not doing so may cause a ban from the MusicBrainz API (consult the README).")
    MBID_KEY = "MusicNetworkingGraph/1.0 ( %s )" %(keys[1])

artistsFull = [] #All artists currently in the dataset.
nextArtists = [] #All artists to be added within the next layer, when we repeat the process on the next depth.
initialLengthOfArtists = 0
limitArtistStrength = 0.9 #Artists that are connected weaker than this aren't included (unless they're already in the dataset.)
shouldWaitForLastFM = True #If we've waited ages for MusicBrainz, by extension we've waited enough time for last.fm too. So we can set it to False. Otherwise it should be True, and we should wait.
updateDataset = 25 #How many artists we should add to artistsDatabaseTemporary before updating the real dataset. Too little would slow down the computer massively (like 1, every artist). Too much would mean if the program crashed, all artists would be lost.

def endProgram():
    print("The program is now stopping.")

def callErrorMessage(message, attemptsAtRequestingArtist):
    print(message) #Last.fm has blocked our program from making too many requests, so got to wait a few seconds
    time.sleep(5 * attemptsAtRequestingArtist) # Just make it incremental to maximise chances of hopefully starting again
    attemptsAtRequestingArtist += 1

    if attemptsAtRequestingArtist > 8:
        raise RuntimeError #After 8 attempts, this artist is clearly crashing the program.
    return attemptsAtRequestingArtist

def getDataFromParams(params, url): #Getting the response from last.fm or mbid and ensuring the data is clean before sending it
    global shouldWaitForLastFM
    attemptsAtRequestingArtist = 1

    while True:
        try:
            if url == BASE_URL:
                response = requests.get(url, params=params, timeout=(5, 15)) #Requesting the data, a maximum of 5 seconds to establish the connection, and then 15 to then retrieve the data 
                if not shouldWaitForLastFM: #We can skip it for now because we've waited for musicbrainz
                    shouldWaitForLastFM = True #Next time we have to wait.
                else:
                    time.sleep(0.2) #This is so we don't get limit polled. Last.fm states that we shouldn't be making more than 5 requests per second (or common sense)
            elif url == MBID_URL:
                response = requests.get(url, params = params, headers = {"User-Agent": MBID_KEY}, timeout=(5, 15)) #Requesting the data, a maximum of 5 seconds to establish the connection, and then 15 to then retrieve the data 
                time.sleep(1.25) #We are requested to wait at least 1 second before requesting again.
                shouldWaitForLastFM = False #Tho by waiting a second, we've waited enough time for last.fm. Maybe. 
            else:
                raise RuntimeError("What. Is. The. Url. %s, %s"  %(url, params['artist'])) #This function is only designed for Last.fm's API and MusicBrainz API for now. Other API's will need their own elif statements and URLs

            if response.status_code == 200: #It worked!
                try:
                    data = response.json()
                except requests.exceptions.JSONDecodeError:
                    attemptsAtRequestingArtist = callErrorMessage("It's not JSON data, not really sure what it is? Attempts at requesting this artist is: %s" %(attemptsAtRequestingArtist), attemptsAtRequestingArtist)
                    continue
                if url == BASE_URL:
                    data = getLastFMData(data, attemptsAtRequestingArtist, params["artist"])
                elif url == MBID_URL:
                    data = getMBIDData(data)
                else:
                    raise RuntimeError("What URL is this?? %s, %s" %(params["artist"], url))
                if data == "lastfmError":
                    continue
                if data == None:
                    return None
            else:
                if url == MBID_URL and response.status_code == 503: #This is mbid's way of saying we have too many requests. Let's slow down for a little bit.
                    attemptsAtRequestingArtist = callErrorMessage("Tried to request mbid info but we are blocked. (attempts at requesting this artist is %s)" %(attemptsAtRequestingArtist), attemptsAtRequestingArtist)
                    time.sleep(5) #Let's just wait even more time, this website is more popular than last.fm so we want to make sure our ip doesn't get blocked
                    shouldWaitForLastFM = False #Tho by waiting at least a second, we've waited enough time for last.fm. Maybe. 
                else:
                    attemptsAtRequestingArtist = callErrorMessage("Servor error, didn't even get anything: %s (attempts at requesting this artist is %s)" %(response.status_code, attemptsAtRequestingArtist), attemptsAtRequestingArtist)
                continue
                
        except requests.exceptions.HTTPError as e: #This is if last.fm sends us a http code that is unsuccessful, however its unlikely.
            if e.response.status_code == 29:
                attemptsAtRequestingArtist = callErrorMessage("Rate limited — sleeping, attempts requested this artist at %s" %(attemptsAtRequestingArtist), attemptsAtRequestingArtist)
                continue
            else:
                endProgram()
                raise #It will raise the previous error
        except requests.exceptions.ConnectionError:
            if url == MBID_URL:
                attemptsAtRequestingArtist = callErrorMessage("Mbid is stopping our connection. Let's wait a little. Attempts requesting this artist at %s" %(attemptsAtRequestingArtist), attemptsAtRequestingArtist)
                time.sleep(5 * attemptsAtRequestingArtist)
                shouldWaitForLastFM = False #Tho by waiting a second, we've waited enough time for last.fm. Maybe. 
            else:
                attemptsAtRequestingArtist = callErrorMessage("Maybe the internet is down? Attempts requesting this artist at %s" %(attemptsAtRequestingArtist), attemptsAtRequestingArtist)
            continue
        except requests.exceptions.Timeout:
            if url == MBID_URL:
                artist = params['query']
                shouldWaitForLastFM = False #Tho by waiting a second, we've waited enough time to not have to wait for last.fm. Maybe. 
            else:
                artist = "artist: %s" %(params['artist'])
            print("Too much time to respond. Last.fm likely left us hanging. The %s" %(artist))
            attemptsAtRequestingArtist += 1
            time.sleep(60)
            continue

        if attemptsAtRequestingArtist > 1:
            print("Successfully no longer blocked!") #Informing us that waiting a few seconds was smart.
        return data

def getLastFMData(data, attemptsAtRequestingArtist, artist): #Checks to see that the Last.fm data wasn't actually just an error
    while True:
        if "error" in data:
            if data["error"] == 29:  
                attemptsAtRequestingArtist = callErrorMessage("Rate limited — sleeping, attempts requested this artist at %s" %(attemptsAtRequestingArtist), attemptsAtRequestingArtist)
                return "lastfmError"
            elif data["error"] == 8:
                attemptsAtRequestingArtist = callErrorMessage("Last.fm Error: Operation failed - Most likely the backend service failed. We'll try again in a few seconds. Attempts requesting this artist at %s" %(attemptsAtRequestingArtist), attemptsAtRequestingArtist)
                return "lastfmError"
            elif data["error"] == 6:
                if data.get('message', '').startswith("The artist you supplied could not be found"):
                    print("We couldn't find the artist %s. Going to return no data" %(artist))
                    return None
                else:
                    endProgram()
                    raise RuntimeError("Last.fm Error: %s" %(data.get('message'))) #Any other error 6 is one we haven't experienced, so would need further investigation.
            else:
                endProgram()
                raise RuntimeError("Last.fm Error: %s" %(data.get('message'))) #Any other error is one we haven't experienced, so would need further investigation.
        return data

def getMBIDData(data): #Checks to see if the artist is real or not
    artists = data.get("artists", [])
    if artists != []:
        for artist in artists:
            mbid = artist['id']
            if mbid == 'eec63d3c-3b81-4ad4-b1e4-7c147d4d2b61':
                #If the first match is [no artist] then we should return nothing.
                return None #eec63d3c-3b81-4ad4-b1e4-7c147d4d2b61 is the id for no artist. This means things like storm recordings, not very useful for our purposes.
            if mbid != None:
                return mbid #Going through all the artists that music brainz matched with the name until we get an id.
                
    else:
        return None #We weren't able to find an id or any artists
    
def getArtistInfo(artist):
    params = {
        "method": "artist.getinfo",
        "artist": artist,
        "api_key": API_KEY,
        "format": "json"
    } #Calling the getInfo from the last.fm, returning metadata from the artist in a json format
    
    data = getDataFromParams(params, BASE_URL)

    if data == None or "artist" not in data:
        return None #We didn't get any artist information

    artistData = data["artist"]
    mbid = artistData.get("mbid")

    if mbid == '' or mbid == None: #We haven't got an associated id for this artist, so it might not exist. Let's try the real musicbrainz id database.
        paramsMbid = {
            "query": "artist: %s" %(artist),
            "fmt": "json"
        }

        mbid = getDataFromParams(paramsMbid, MBID_URL)

        if mbid == None: #We still didn't recieve an id, so it probably doesnt exist. 
            print("Artist doesn't have an associated music id. Artist is: %s" %(artist))
            return None
    return {
        "name": artistData.get("name"),
        "listeners": int(artistData["stats"].get("listeners", 0)),
        "playcount": int(artistData["stats"].get("playcount", 0)),
        "mbid": mbid,
        "tags": [tag["name"] for tag in artistData.get("tags", {}).get("tag", [])]
    }

def getSimilarArtists(artist, limit): #limit is used if we'd like to set a limit for how many similar artists are returned. But we do it based off the strength similarity instead now
    paramsSimilar = {
        "method": "artist.getsimilar",
        "artist": artist,
        "api_key": API_KEY,
        "format": "json"
    }

    similarArtistsJSON = getDataFromParams(paramsSimilar, BASE_URL)
    
    if similarArtistsJSON == None or "similarartists" not in similarArtistsJSON:
        return [[]] #An empty array of arrays as there are no similar artists with this artist
    similarArtistsJSON = similarArtistsJSON["similarartists"]["artist"]

    similarArtistsCSV = []
    count = 0
    stopAddingArtists = False
    for similarArtist in similarArtistsJSON:
        if similarArtist["name"] == artist:
            print("We found the original artist within the artists it's similar to. %s, %s" %(similarArtist["name"], artist))
            continue #This should never happen - a similar artist shouldn't be the artist itself. For some reason this happens
        if artist in similarArtist["name"] and ("," in similarArtist["name"] or "&" in similarArtist["name"] or 'feat' in similarArtist['name'] or 'and' in similarArtist['name'] or ' + ' in similarArtist['name']):
            continue #Our best attempt at trying to remove "artists" that are just a collobaration.
        if float(similarArtist["match"]) <= limitArtistStrength:
            stopAddingArtists = True #We've added enough artists.
        if not stopAddingArtists or similarArtist["name"] in artistsFull:
            similarArtistsCSV.append([similarArtist["name"], similarArtist["match"]]) #No matter how weak the connection, or whatever limit we've given it - if this artist is somewhat similar to an artist we've already recorded, that's useful information.
            count += 1
    return similarArtistsCSV

def getRandomSimilarArtists():
    #Not used anymore, but useful for testing the dataset without calling last.fm
    #For now, we're just going to assign the metadata randomly

    randomArtists = ['Atoms for Peace', 'Mark Pritchard', 'Jonny Greenwood', 'Burial & Four Tet & Thom Yorke', 'Philip Selway', 'Grizzly Bear', 
                 'Damon Albarn', 'James Blake', 'UNKLE', 'Thom Yorke', 'Ultraísta', 'Mark Pritchard', 'Jonny Greenwood', 
                 'Burial & Four Tet & Thom Yorke', 'Grizzly Bear', 'Apparat', 'Ataxia', 'Four Tet','Jeff Buckley & Gary Lucas', 
                 'Elliott Smith', 'Tim Buckley', 'Nick Drake', 'Fiona Apple', 'Adrianne Lenker', 'Phoebe Bridgers', 
                 'Kurt Cobain', 'Faye Webster', 'Julian Casablancas', 'Albert Hammond, Jr.', 'Arctic Monkeys', 'Interpol', 
                 'Cage the Elephant', 'The Symposium', 'The Last Shadow Puppets', 'Alex Turner', 'Benches', 'Franz Ferdinand', 
                 'Royal Blood', 'Placebo', 'Nothing But Thieves', 'Franz Ferdinand', 'Coldplay', 'Feeder', '30 Seconds to Mars', 
                 'Foo Fighters', 'The Killers', 'Rivers Cuomo', 'The Rentals', 'Ozma', 'Fountains of Wayne', 'Green Day', 'Jimmy Eat World', 
                 'Wheatus', 'Pixies', 'The Presidents of the United States of America', 'Kurt Cobain', 'The Jins', 'Alice in Chains', 
                 'Meat Puppets', 'Soundgarden', 'Mudhoney', 'Hole', 'Stone Temple Pilots', 'Mad Season', 'Foo Fighters', 'Team Sleep', 'Korn', 
                 'Chevelle', 'Superheaven', 'Fleshwater', 'Loathe', 'Limp Bizkit', '†††', 'Slipknot', 'Chino Moreno', 'Morrissey', 'Joy Division', 
                 'The Cure', 'New Order', 'Johnny Marr', 'Echo & the Bunnymen', 'Talking Heads', 'The Sound', 'The Stone Roses', 
                 'Billy Corgan', 'Zwan', 'Stone Temple Pilots', 'Soundgarden', 'Pearl Jam', 'Alice in Chains', 'Pixies', 'Silverchair', 'Bush', 'Nirvana']

    similarArtists = []
    for i in range(3):
        try:
            randomArtistPosition = random.randint(0, len(randomArtists) - 1)
            randomArtist = randomArtists[randomArtistPosition]
            similarArtists.append([randomArtist, int(random.randint(1, 1000)) / 1000])
            randomArtists.pop(randomArtistPosition)
        except:
            continue
    return similarArtists

def createDataset(artists, initialDepth, lastArtistAdded, max):

    global artistsFull, nextArtists, initialLengthOfArtists, updateDataset, artistsMaxCount

    depth = initialDepth #Normally at 0, unless we are loading from a save point 
    continueCounter = 0 #Testing variables - this tells us how many times we saw a similar artist
    notContinueCounter = 0 #Testing variables - this tells us how many times we saw a new artist

    artistsCount = 0 #Used to check how many artists we've added to artistsTemporaryDictionary. If it's more than 25 (or updateDataset), then we stop retrieving artists and save the dictionary to the dataset. Then it's reset to 0.
    artistsMaxCount = 0 #Used to check how many artists we've added overall, from the very start of running.
    percentageArtistsCount = 0 #Used to check how many artists we've added within this specific depth. The next layer, it gets reset to 0. It's named "percentage" since we divide it by the length of the artists to print a percentage

    limits = [40, 40, 20, 10, 5, 3] #How many similar artists to check at different depths - at depth 3, we want fewer. NOT USED - We now use similarity strength.

    artistsDatabaseTemporary = [] #Every 25 (or whatever updateDataset is) artists, all artists in this gets added to the dataset, and is reset as an empty array.
    if artists == [] or artists == None:
        return #No artists to check

    if lastArtistAdded != None:
        artists = artists[artists.index(lastArtistAdded) + 1:] #Since the last artist saved to the csv file is already in the csv file, we want to loop through new artists - so one more from there. 

    while depth <= max:

        for artist in artists:
            artistInfo = getArtistInfo(artist)

            if artistInfo == None:
                print("No information to be gained. Artist: %s. Total artists: %s." %(artist, artistsMaxCount))
                continue #There's no information to be gained from this artist

            if depth >= len(limits): #Not used anymore, but it's here if the code starts using limits again rather than similarity strengths
                limit = limits[len(limits) - 1] #If for some reason the depth is greater than the limits we've set, just set it to the last limit in the array.
            else:
                limit = limits[depth]

            similarArtistsJSON = getSimilarArtists(artist, limit) #Limit is how many similar artists it will return. Returns [[Artist A, 0.9], [Artist B, 0.7], [Artist C, 0.5]] if limit is 3.
            if similarArtistsJSON == [[]] or similarArtistsJSON == None:
                print("Artist doesn't have any similar artists. Artist: %s. Total artists: %s." %(artist, artistsMaxCount)) #There are no similar artists for this artist. We may have reached the end of a tree! If that is true, that is very exciting - we can add more depth or more initial artists
                similarArtistsCSV = ";" #no information!
                artistStrengthsCSV = ";" #no information!
            else:
                similarArtistsCSV = ''
                artistStrengthsCSV = ''
                for similarArtist in similarArtistsJSON:
                    
                    similarArtistsCSV += "%s;" %(similarArtist[0]) #; because csv files work like that, commas separate each element, and semicolons separate each piece of data within an element
                    artistStrengthsCSV += "%s;" %(similarArtist[1])

                    if similarArtist[0] in artistsFull:
                        continueCounter += 1 #Used for debugging
                        continue #We don't want any artists that we already have the info for, also don't want any duplicates
                    notContinueCounter += 1

                    artistsFull.append(similarArtist[0]) #Adding the new artist to the full list
                    nextArtists.append(similarArtist[0]) #Adding the artist to the next ones we shall check once we've checked all the "artists" (in for loop)
                similarArtistsCSV = similarArtistsCSV[0:len(similarArtistsCSV) - 1] #len() -1 so we remove the ; at the end
                artistStrengthsCSV = artistStrengthsCSV[0:len(artistStrengthsCSV) - 1] #len() -1 so we remove the ; at the end

            newArtist = {"artist_name": artist, 
                                "similarArtists": similarArtistsCSV,
                                "artistStrength":artistStrengthsCSV,
                                "listeners":artistInfo["listeners"],
                                "playcount":artistInfo["playcount"],
                                "mbid":artistInfo["mbid"],
                                "tags":artistInfo["tags"],
                                "dataGeneratedAt":datetime.datetime.now()}
            artistsCount += 1
            percentageArtistsCount += 1
            artistsMaxCount += 1
            artistsDatabaseTemporary.append(newArtist)

            if artistsCount >= updateDataset:
                print("Saving progress.", end=" ")
                percentageCompleted = round((percentageArtistsCount / len(artists) * 100), 2) #2 is to 2 d.p
                lastArtistMessage = "This can be used to save progress (depth is %s) Artist, artists, nextArtists (Time is %s):\n%s\n%s\n%s\n%s\n%s" %(depth, datetime.datetime.now(), depth, artist, ";".join(artists), ";".join(nextArtists), max)                  
                with open(lastArtistFilename, "w", encoding='utf-8') as f:
                    f.write(lastArtistMessage) #Saving the artists we are currently viewing to a text file.
                dfArtistsVaried = pd.DataFrame(artistsDatabaseTemporary)
                dfArtistsVaried.to_csv(csvFilenameGradual, mode="a", header=not os.path.exists(csvFilenameGradual), index=False) #Index = false so 0, 1, 2, 3, 4 arent generated (its not necessary)
                artistsDatabaseTemporary = [] #Resetting the artists as they've been added now
                artistsCount = 0
                remainingArtists = len(artists) - percentageArtistsCount
                print("Currently at: %s artists newly recorded, %s artists are in the dataset. %s%% of the current depth (%s) is completed. Remaining artists: %s. Recorded at %s" %(artistsMaxCount, artistsMaxCount + initialLengthOfArtists, percentageCompleted, depth, remainingArtists, datetime.datetime.now()))
        
        with open(artistsAtDepthFilename, "a", encoding='utf-8') as f:
            f.write("Depth %s completed! There were %s artists in this depth added (from when we started running). Currently there are %s artists in the dataset.\n" %(depth, percentageArtistsCount, initialLengthOfArtists + artistsMaxCount))
        percentageArtistsCount = 0
        artists = nextArtists
        nextArtists = [] #Reassigning the nextArtists to a new variable []. Since python looks at labels, artists is not affected.
        depth += 1
    lastArtistMessage = "Dataset is finished! We can continue from here: Artist, artists, nextArtists (Time is %s):\n%s\n%s\n%s\n%s\n%s" %(datetime.datetime.now(), depth, "NaN", ";".join(artists), "", depth) #Saving the next artists we would view if we wanted to run the dataset in more depth. Since we put artists = nextArtists, we need to use that variable instead.
    with open(lastArtistFilename, "w", encoding='utf-8') as f:
        f.write(lastArtistMessage)
        
    if artistsDatabaseTemporary != []:
        #Very likely hahaha unless it happens to end on a multiple of 25
        dfArtistsVaried = pd.DataFrame(artistsDatabaseTemporary)
        dfArtistsVaried.to_csv(csvFilenameGradual, mode="a", header=not os.path.exists(csvFilenameGradual), index=False) #Index = false so 0, 1, 2, 3, 4 arent generated (its not necessary)

    print("Number of times we saw a similar artist again: %s and number of times we added a new artist %s." %(continueCounter, notContinueCounter))

def calculateTime(lengthOfArtists, depth): #Returns the time in minutes
    def averageSimilarArtists(): #Returns the average similar artists for an artist
        return round(10 * (1 - 0.8)) #This is purely a guess. If the limitArtistStrength is 0.8, then there'll be approximately 2 similarArtists per artist on average, etc.
    totalArtists = lengthOfArtists
    layerArtists = totalArtists
    for layer in range(depth):
        layerArtists *= averageSimilarArtists()
        totalArtists += layerArtists
    return totalArtists / 25 #Using the rule that every 25 artists takes a minute or so, dividing it by 25 gives the total number of minutes

def convertMinutesToMessage(minutes):
    if minutes < 1: #It's better to give it as seconds
        seconds = round(minutes * 60, 2)
        return "%s seconds" %(seconds)
    elif minutes > 60: #It's better to give it as hours
        hours = round(minutes / 60, 2)
        if hours > 100: #It's better to give it as days
            days = round(hours / 24, 2)
            return "%s days" %(days)
        return "%s hours" %(hours)
    return "%s minutes" %(minutes)

def removeDuplicates(arr):
    n = len(arr)
    copyArr = copy.deepcopy(arr)
    
    # Outer loop to pick each element one by one
    for i in range(n - 1):
      
        # Inner loop to compare the current element with the 
        # rest of the elements
        for j in range(i + 1, n):
          
            # If a duplicate is found return True
            if arr[i] == arr[j]:
                copyArr.remove(arr[i])
    
    # If no duplicates are found, return False
    return copyArr

def checkDuplicates(arr):
    n = len(arr)
    
    # Outer loop to pick each element one by one
    for i in range(n - 1):
      
        # Inner loop to compare the current element with the 
        # rest of the elements
        for j in range(i + 1, n):
          
            # If a duplicate is found return True
            if arr[i] == arr[j]:
                return True
    
    # If no duplicates are found, return False
    return False

def loadDataset(masterSeeds, method):
    global artistsFull, nextArtists, initialLengthOfArtists

    if os.path.exists(csvFilenameGradual) and os.path.getsize(csvFilenameGradual) > 0:
        df = pd.read_csv(csvFilenameGradual)
        df = df.drop_duplicates(subset=['mbid'], keep='first')
        #artistsFull is a combination of all of the artists in the dataset up until the layer of the artists we were looking at before, and then all of those artists within that layer, and then all of the similarArtists that were being
        #generated from the artists within the layer that we've looked at. 
        artistNames = df['artist_name'].values
        initialLengthOfArtists = len(artistNames)
        if method == 'continue':
            with open(lastArtistFilename, "r", encoding='utf-8') as f:
                artistData = f.read()
                artistData = artistData.split("\n")
                try:
                    initialDepth = int(artistData[1])
                except:
                    raise
                if artistData[2] == "NaN" or artistData[2] == None:
                    artist = None #This is perfectly fine. It means that we're at the start of a new layerc
                else:
                    artist = artistData[2] #The second line, since the first is just info (strip removes any spaces before or after which may be there)
                artists = artistData[3].split(";")
                try:
                    nextArtists = artistData[4].split(";") 
                except IndexError:
                    nextArtists = [] #If there are no nextArtists, then we completed a layer - and that layer has now become artists. 
                try:
                    maxDepth = int(artistData[5])
                except:
                    raise
                
            for name in artistNames:
                if name == artists[0]:
                    break #At this point, we can start adding the items from artists to artistsFull
                artistsFull.append(name)
            for name in artists:
                if not name in artistsFull:
                    artistsFull.append(name) #Adding all the artists of the current layer of depth to artistsFull (so long as it's not already there)
            for name in nextArtists:
                if not (name in artistsFull or name == ''):
                    artistsFull.append(name) #Adding all the similar artists of the artists at the current depth that we have checked. Theoretically this could be 0 (if there aren't any nextArtists) (so long as it's not already there)
            newSeeds = artists
            lastArtistAdded = artist
            print("About to check if there are duplicates in the initial artists.")
            
            if checkDuplicates(artistsFull):
                raise RuntimeError("We found duplicates in the artists you gave in the initial dataset or something. Think it's best you check on it before proceeding.")
            else:
                print("No duplicates found. Let's proceed!")
        else:
            #We are adding new artists to the dataset. All we need to check is whether they exist already.
            artists = removeDuplicates(masterSeeds) #Remove any potential duplicates
            artistsFull = copy.deepcopy(artists)
            for artistName in artistNames:
                if artistName in artists:
                    artists.remove(artistName)
                    print("Artist %s is already within the dataset." %(artistName))
                artistsFull.append(artistName)
            lastArtistAdded = None
            newSeeds = artists
            initialDepth = 0
            maxDepth = depth
            if len(newSeeds) != 0: #Only create and empty the file if there definitely are new artists we can potentially add. 
                open(artistsAtDepthFilename, "w").close()
    else:
        #If there is no csv file, then we are starting from a brand new empty file.
        newSeeds = masterSeeds
        lastArtistAdded = None
        artistsFull = copy.deepcopy(newSeeds)
        initialDepth = 0
        maxDepth = depth
    
    if len(newSeeds) == 0:
        print("All artists provided are already in the dataset.")
        return
    
    print("About to start generating the dataset. It'll take approximately %s to finish." %(convertMinutesToMessage(calculateTime(len(newSeeds), maxDepth - initialDepth))))
    createDataset(newSeeds, initialDepth, lastArtistAdded, maxDepth)

masterSeeds = [
        # --- GLOBAL HUBS (The Connectors) ---
        "David Bowie", "Kanye West", "Björk", "Radiohead", "Daft Punk", 
        "Gorillaz", "Miles Davis", "Kraftwerk", "Pink Floyd", "Kate Bush", "Bruno Mars",

        # New Hubs - Global & Genre Pillars
        "Fela Kuti", "Black Sabbath", "Nina Simone",
        "Bob Marley", "Johnny Cash", "Ravi Shankar", "Kraftwerk", "Selena",
        "Aphex Twin", "Stevie Wonder", "Wu-Tang Clan",
        "Johann Sebastian Bach", "Eminem", "Madonna", "Metallica", "Public Enemy",
        "The Beatles", "Abba", "Dolly Parton",

        # --- LATIN & IBERIAN (Spanish, Portuguese, Catalan) ---
        "Bad Bunny", "Rosalía", "Soda Stereo", "Jorge Ben Jor", "Shakira",  "Daddy Yankee",

        # --- EAST ASIA (Japanese, Korean, Mandarin, Cantonese) ---
        "Ryuichi Sakamoto", "Seventeen", "Cui Jian", "Teresa Teng", "Fishmans", 
        "Jay Chou", "Joe Hisaishi", "Utada Hikaru", "BTS", "BLACKPINK", "TWICE", "Fuji Kaze",
        "YOASOBI", "Mrs Green Apple",

        # --- SOUTH ASIA & MIDDLE EAST (Hindi, Punjabi, Arabic, Persian, Urdu) ---
        "A.R. Rahman", "Lata Mangeshkar",

        # --- AFRICA (Yoruba, French, Zulu, Wolof) ---
        "Fela Kuti", "Burna Boy",

        # --- EUROPEAN NON-ENGLISH (French, German, Russian, Italian) ---
        "Édith Piaf", "Ennio Morricone",
    ]

EXPANSION_SEEDS = [
    #We know these are new
    'Frank Ocean', 'Jay-Z', 'OutKast', 'MF DOOM', 'Blink-182',
    #Spotfiy artists with over a billion streams
    'Jack Harlow', 'Rihanna', 'The Weekend', 'Wallows', 'Neon Trees', 'sombr', 'Harry Styles', 'Arctic Monkeys',
    # Indie & Alternative Staples
    "The Strokes", "LCD Soundsystem", "Beach House", "Tame Impala", "Mac DeMarco", 
    "The Cure", "The Smiths", "Joy Division", "Sonic Youth", "Pixies", 
    "Pavement", "Arcade Fire", "Vampire Weekend", "The White Stripes", "Radiohead",
    
    # R&B, Soul & modern Groove
     "SZA", "Erykah Badu", "D'Angelo", "Solange", 
    "Childish Gambino", "Kaytranada", "Thundercat", "Anderson .Paak", "Lauryn Hill", 'Daniel Caesar', 'Steve Lacy', 'Olivia Dean', 'LANY',
    
    # Electronic & IDM (Connectors)
    "Aphex Twin", "Four Tet", "Burial", "Bonobo", "Flying Lotus", 
    "Disclosure", "Jamie xx", "Justice", "The Avalanches", "Boards of Canada", 'Avicii',
    
    # Modern Pop & "Alt-Pop"
    "Charli XCX", "Caroline Polachek", "Lana Del Rey", "FKA twigs", "Lorde",
    "Mitski", "Japanese House", "Wet Leg", "Boygenius", "Clairo", '5 Seconds of Summer', 'The 1975', 'The Hunna', 'Two Door Cinema Club',
    
    # Heavy & Experimental
    "Deftones", "My Bloody Valentine", "Slowdive", "Death Grips", "Cocteau Twins",
    "Animal Collective", "Neutral Milk Hotel", "System of a Down", "Tool", "Nine Inch Nails"
]

print("Welcome to generating the dataset!", end=" ")

while True:
    userInput = input("Would you like to load any new artists, or continue from a previous save point? L for load, C for continue. ").strip().lower() #Most of this is basic, just a lot of input validation

    if userInput.startswith("l"): #Loading dataset
        initialArtists = []
        while initialArtists == []:
            initialArtists = input("Which artists would you like to see? Please add a semicolon and a space, such as: Artist A; Artist B; Artist C ").split("; ")
            if initialArtists == []:
                print("Please enter artists. Or kill this terminal if you meant to continue from a save point instead.")
        
        while True:
            depth = input("What depth would you like to generate the dataset at? ")
            try:
                depth = int(depth)
                if depth < 0:
                    print("Enter a number equal or greater to 0.")
                    continue
                elif depth == 0:
                    print("You've entered 0. That means the dataset will retrieve the information of the artists you've provided, but not any information of the similar artists.")
                break
            except:
                print("Please enter an integer.")
                continue
        loadDataset(initialArtists, "load")
        
    elif userInput.startswith("c"):
        with open(lastArtistFilename, "r", encoding='utf-8') as f: #Check to see if the text file is empty
            artistData = f.read()
            try:
                artistData = artistData.split("\n")
                if len(artistData) < 2:
                    raise RuntimeError #There's nothing in the array, so the file is probably empty
                if artistData[3] == "": #VERY Interesting. This means everything has worked, but the algorithm couldn't find any new similar artists to add - meaning all branches have been reached to its limit.
                    print("All similar artists have been generated! Try loading/generating some new artists instead.")
                    raise RuntimeError
            except:
                print("There aren't any artists in the text file to load from! Would you like to try generating new artists instead? ")
                continue
        loadDataset([], "continue")
    else:
        print("Please enter L or C.")
        continue
    print("Finished!", end = " ")
    if input("Would you like to continue? Y for yes, N for no ").strip().lower().startswith("y"):
        print("Fantastic! If you choose to continue at a higher depth, simply type continue. Or if you want to see new artists, press L.")
    else:
        break